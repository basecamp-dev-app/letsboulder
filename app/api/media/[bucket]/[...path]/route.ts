import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { GetObjectCommand } from '@aws-sdk/client-s3'
import { createClient } from '@supabase/supabase-js'
import sharp from 'sharp'
import { createR2Client } from '@/lib/media/r2'

export const runtime = 'nodejs'

const MAX_WIDTH = 2400
const DEFAULT_QUALITY = 85

function parsePositiveInt(value: string | null): number | null {
  if (!value) return null
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed) || parsed <= 0) return null
  return parsed
}

function normalizeQuality(value: string | null): number {
  const parsed = parsePositiveInt(value)
  if (!parsed) return DEFAULT_QUALITY
  return Math.min(100, Math.max(1, parsed))
}

function pickOutputFormat(request: NextRequest, contentType: string, requestedFormat: string | null) {
  const normalized = requestedFormat?.toLowerCase() || null
  if (normalized === 'avif' || normalized === 'webp' || normalized === 'jpeg' || normalized === 'png') {
    return normalized
  }

  const accept = request.headers.get('accept') || ''
  if (accept.includes('image/avif')) return 'avif'
  if (accept.includes('image/webp')) return 'webp'
  if (contentType.includes('png')) return 'png'
  if (contentType.includes('jpeg') || contentType.includes('jpg')) return 'jpeg'
  return null
}

async function transformImage(
  request: NextRequest,
  bytes: Buffer,
  contentType: string
): Promise<{ bytes: Buffer; contentType: string } | null> {
  const widthParam = parsePositiveInt(request.nextUrl.searchParams.get('w'))
  const quality = normalizeQuality(request.nextUrl.searchParams.get('q'))
  const requestedFormat = request.nextUrl.searchParams.get('format')
  const shouldTransform = widthParam !== null || requestedFormat !== null || request.nextUrl.searchParams.has('q')

  if (!shouldTransform || !contentType.startsWith('image/')) {
    return null
  }

  const width = widthParam ? Math.min(widthParam, MAX_WIDTH) : null
  const outputFormat = pickOutputFormat(request, contentType, requestedFormat)
  let pipeline = sharp(bytes, { failOn: 'none' }).rotate()

  if (width) {
    pipeline = pipeline.resize({
      width,
      fit: 'inside',
      withoutEnlargement: true,
    })
  }

  switch (outputFormat) {
    case 'avif':
      pipeline = pipeline.avif({ quality })
      return { bytes: await pipeline.toBuffer(), contentType: 'image/avif' }
    case 'webp':
      pipeline = pipeline.webp({ quality })
      return { bytes: await pipeline.toBuffer(), contentType: 'image/webp' }
    case 'jpeg':
      pipeline = pipeline.jpeg({ quality, mozjpeg: true })
      return { bytes: await pipeline.toBuffer(), contentType: 'image/jpeg' }
    case 'png':
      pipeline = pipeline.png({ quality })
      return { bytes: await pipeline.toBuffer(), contentType: 'image/png' }
    default:
      if (width) {
        return { bytes: await pipeline.toBuffer(), contentType }
      }
      return null
  }
}

function getServiceRoleClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL

  if (!serviceRoleKey || !supabaseUrl) {
    throw new Error('Supabase service role is not configured')
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

async function streamToBuffer(stream: AsyncIterable<Uint8Array>): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk))
  }

  return Buffer.concat(chunks)
}

function isR2ManagedBucket(bucket: string): boolean {
  return bucket === process.env.R2_PRIVATE_BUCKET || bucket === process.env.R2_PUBLIC_BUCKET
}

async function canReadObject(bucket: string, path: string, userId: string | null) {
  if (!isR2ManagedBucket(bucket)) {
    return false
  }

  const admin = getServiceRoleClient()

  const { data: imageRows, error: imageError } = await admin
    .from('images')
    .select('id, created_by, moderation_status')
    .eq('original_bucket', bucket)
    .eq('original_key', path)
    .limit(10)

  if (imageError) {
    throw imageError
  }

  if ((imageRows || []).some((row) => row.moderation_status === 'approved' || (!!userId && row.created_by === userId))) {
    return true
  }

  const privateRef = `private://${bucket}/${path}`
  const { data: cragImageRows, error: cragImageError } = await admin
    .from('crag_images')
    .select('id, linked_image_id, source_image_id')
    .eq('url', privateRef)
    .limit(5)

  if (cragImageError) {
    throw cragImageError
  }

  const linkedIds = Array.from(new Set((cragImageRows || [])
    .flatMap((row) => [row.linked_image_id, row.source_image_id])
    .filter((value): value is string => typeof value === 'string' && !!value)))

  if (linkedIds.length === 0) {
    return false
  }

  const { data: linkedImages, error: linkedError } = await admin
    .from('images')
    .select('id, created_by, moderation_status')
    .in('id', linkedIds)

  if (linkedError) {
    throw linkedError
  }

  return (linkedImages || []).some((row) => row.moderation_status === 'approved' || (!!userId && row.created_by === userId))
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ bucket: string; path: string[] }> }
) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Use CDN for production' }, { status: 404 })
  }

  const { bucket, path: pathSegments } = await params
  const objectPath = Array.isArray(pathSegments) ? pathSegments.join('/') : ''

  if (!bucket || !objectPath) {
    return NextResponse.json({ error: 'Invalid media path' }, { status: 400 })
  }

  const cookies = request.cookies
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookies.getAll() },
        setAll() {},
      },
    }
  )

  try {
    const { data: { user } } = await supabase.auth.getUser()
    const allowed = await canReadObject(bucket, objectPath, user?.id || null)

    if (!allowed) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const r2 = createR2Client()
    const response = await r2.send(new GetObjectCommand({ Bucket: bucket, Key: objectPath }))
    if (!response.Body) {
      return NextResponse.json({ error: 'Failed to load media' }, { status: 404 })
    }

    const bytes = await streamToBuffer(response.Body as AsyncIterable<Uint8Array>)
    const contentType = response.ContentType || 'application/octet-stream'

    const transformed = await transformImage(request, bytes, contentType)
    const responseBytes = transformed?.bytes || bytes
    const responseContentType = transformed?.contentType || contentType

    return new NextResponse(new Uint8Array(responseBytes), {
      headers: {
        'Content-Type': responseContentType,
        'Content-Length': String(responseBytes.byteLength),
        'Cache-Control': 'public, max-age=31536000, immutable',
        Vary: 'Accept',
      },
    })
  } catch (error) {
    console.error('Media proxy error:', error)
    return NextResponse.json({ error: 'Failed to load media' }, { status: 500 })
  }
}
