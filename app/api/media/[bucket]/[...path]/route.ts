import { NextRequest, NextResponse } from 'next/server'
import { getServerClientFromRequest } from '@/lib/supabase-server'
import { GetObjectCommand } from '@aws-sdk/client-s3'
import { createClient } from '@supabase/supabase-js'
import sharp from 'sharp'
import { createR2Client } from '@/lib/media/r2'
import { serverEnv } from '@/lib/env.server'
import { reportError } from '@/lib/errors'

function buildCdnUrl(objectPath: string): string | null {
  const cdnBaseUrl = serverEnv.NEXT_PUBLIC_MEDIA_CDN_URL
  if (!cdnBaseUrl || !objectPath) return null
  const normalizedPath = objectPath.split('/').filter(Boolean).map((segment) => encodeURIComponent(segment)).join('/')
  return `${cdnBaseUrl}/${normalizedPath}`
}

function getCorsHeaders(access: MediaAccess): HeadersInit {
  if (access === 'private') {
    return {}
  }

  return {
    'Access-Control-Allow-Origin': '*',
  }
}

function buildResponseHeaders(
  access: MediaAccess,
  headers: Record<string, string>
): HeadersInit {
  return {
    ...headers,
    ...getCorsHeaders(access),
  }
}

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 204,
    headers: buildResponseHeaders('private', {
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    }),
  })
}

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

function requestNeedsImageTransform(request: NextRequest, contentType: string): boolean {
  const widthParam = parsePositiveInt(request.nextUrl.searchParams.get('w'))
  const requestedFormat = request.nextUrl.searchParams.get('format')
  const requestedQuality = request.nextUrl.searchParams.has('q')

  if (!contentType.startsWith('image/')) {
    return false
  }

  return widthParam !== null || requestedFormat !== null || requestedQuality
}

async function transformImage(
  request: NextRequest,
  bytes: Buffer,
  contentType: string
): Promise<{ bytes: Buffer; contentType: string } | null> {
  const widthParam = parsePositiveInt(request.nextUrl.searchParams.get('w'))
  const quality = normalizeQuality(request.nextUrl.searchParams.get('q'))
  const requestedFormat = request.nextUrl.searchParams.get('format')
  const shouldTransform = requestNeedsImageTransform(request, contentType)

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
  const serviceRoleKey = serverEnv.SUPABASE_SERVICE_ROLE_KEY
  const supabaseUrl = serverEnv.NEXT_PUBLIC_SUPABASE_URL

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
  return bucket === serverEnv.R2_PRIVATE_BUCKET || bucket === serverEnv.R2_PUBLIC_BUCKET
}

type MediaAccess = 'public' | 'private'

function mergeMediaAccess(current: MediaAccess, next: MediaAccess): MediaAccess {
  return current === 'public' || next === 'public' ? 'public' : 'private'
}

function getMediaCacheControl(access: MediaAccess): string {
  return access === 'public' ? 'public, max-age=31536000, immutable' : 'private, no-store'
}

function getRowAccess(
  rows: Array<{ created_by: string | null; moderation_status: string | null }>,
  userId: string | null
): MediaAccess | null {
  let access: MediaAccess | null = null

  for (const row of rows) {
    if (row.moderation_status === 'approved') {
      access = mergeMediaAccess(access ?? 'private', 'public')
      continue
    }

    if (userId && row.created_by === userId) {
      access = mergeMediaAccess(access ?? 'private', 'private')
    }
  }

  return access
}

async function canReadObject(bucket: string, path: string, userId: string | null): Promise<MediaAccess | null> {
  const admin = getServiceRoleClient()

  const isR2 = isR2ManagedBucket(bucket)

  if (isR2) {
    const { data: imageRows, error: imageError } = await admin
      .from('images')
      .select('id, created_by, moderation_status')
      .eq('original_bucket', bucket)
      .eq('original_key', path)
      .limit(10)

    if (imageError) {
      throw imageError
    }

    const access = getRowAccess(imageRows || [], userId)
    if (access) {
      return access
    }
  }

  const privateRef = `private://${bucket}/${path}`

  {
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

    if (linkedIds.length > 0) {
      const { data: linkedImages, error: linkedError } = await admin
        .from('images')
        .select('id, created_by, moderation_status')
        .in('id', linkedIds)

      if (linkedError) {
        throw linkedError
      }

      const access = getRowAccess(linkedImages || [], userId)
      if (access) {
        return access
      }
    }
  }

  if (!isR2) {
    const { data: legacyImageRows, error: legacyError } = await admin
      .from('images')
      .select('id, created_by, moderation_status')
      .eq('storage_bucket', bucket)
      .eq('storage_path', path)
      .limit(10)

    if (legacyError) {
      throw legacyError
    }

    const access = getRowAccess(legacyImageRows || [], userId)
    if (access) {
      return access
    }
  }

  return null
}

async function serveFromSupabaseStorage(
  request: NextRequest,
  bucket: string,
  objectPath: string,
  access: MediaAccess
): Promise<NextResponse> {
  const admin = getServiceRoleClient()
  const { data, error } = await admin.storage.from(bucket).createSignedUrl(objectPath, 300)

  if (error || !data?.signedUrl) {
    return NextResponse.json({ error: 'Failed to load media' }, {
      status: 404,
      headers: getCorsHeaders(access),
    })
  }

  const fetched = await fetch(data.signedUrl)
  if (!fetched.ok) {
    return NextResponse.json({ error: 'Failed to load media' }, {
      status: 404,
      headers: getCorsHeaders(access),
    })
  }

  const contentType = fetched.headers.get('content-type') || 'application/octet-stream'
  const shouldTransform = access === 'private' && requestNeedsImageTransform(request, contentType)

  if (!shouldTransform) {
    return new NextResponse(fetched.body, {
      headers: buildResponseHeaders(access, {
        'Content-Type': contentType,
        'Content-Length': fetched.headers.get('content-length') || '',
        'Cache-Control': getMediaCacheControl(access),
      }),
    })
  }

  const bytes = Buffer.from(await fetched.arrayBuffer())

  const transformed = await transformImage(request, bytes, contentType)
  const responseBytes = transformed?.bytes || bytes
  const responseContentType = transformed?.contentType || contentType

  return new NextResponse(new Uint8Array(responseBytes), {
    headers: buildResponseHeaders(access, {
      'Content-Type': responseContentType,
      'Content-Length': String(responseBytes.byteLength),
      'Cache-Control': getMediaCacheControl(access),
      Vary: 'Accept',
    }),
  })
}

async function serveFromR2(
  request: NextRequest,
  bucket: string,
  objectPath: string,
  access: MediaAccess
): Promise<NextResponse> {
  const isPublicObject = access === 'public' && bucket === serverEnv.R2_PUBLIC_BUCKET

  if (isPublicObject) {
    const cdnUrl = buildCdnUrl(objectPath)
    if (cdnUrl) {
      return NextResponse.redirect(cdnUrl, 302)
    }
  }

  const r2 = createR2Client()
  const response = await r2.send(new GetObjectCommand({ Bucket: bucket, Key: objectPath }))

  if (!response.Body) {
    return NextResponse.json({ error: 'Failed to load media' }, {
      status: 404,
      headers: getCorsHeaders(access),
    })
  }

  const contentType = response.ContentType || 'application/octet-stream'
  const shouldTransform = access === 'private' && requestNeedsImageTransform(request, contentType)

  if (!shouldTransform) {
    return new NextResponse(response.Body as ReadableStream, {
      headers: buildResponseHeaders(access, {
        'Content-Type': contentType,
        'Content-Length': response.ContentLength ? String(response.ContentLength) : '',
        'Cache-Control': getMediaCacheControl(access),
      }),
    })
  }

  const bytes = await streamToBuffer(response.Body as AsyncIterable<Uint8Array>)

  const transformed = access === 'private'
    ? await transformImage(request, bytes, contentType)
    : null
  const responseBytes = transformed?.bytes || bytes
  const responseContentType = transformed?.contentType || contentType

  return new NextResponse(new Uint8Array(responseBytes), {
    headers: buildResponseHeaders(access, {
      'Content-Type': responseContentType,
      'Content-Length': String(responseBytes.byteLength),
      'Cache-Control': getMediaCacheControl(access),
      Vary: 'Accept',
    }),
  })
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ bucket: string; path: string[] }> }
) {
  const { bucket, path: pathSegments } = await params
  const objectPath = Array.isArray(pathSegments) ? pathSegments.join('/') : ''

  if (!bucket || !objectPath) {
    return NextResponse.json({ error: 'Invalid media path' }, {
      status: 400,
      headers: getCorsHeaders('private'),
    })
  }

  const isR2 = isR2ManagedBucket(bucket)
  const supabase = getServerClientFromRequest(request)

  try {
    const { data: { user } } = await supabase.auth.getUser()
    const access = await canReadObject(bucket, objectPath, user?.id || null)

    if (!access) {
      return NextResponse.json({ error: 'Not found' }, {
        status: 404,
        headers: getCorsHeaders('private'),
      })
    }

    if (isR2) {
      return await serveFromR2(request, bucket, objectPath, access)
    }

    return await serveFromSupabaseStorage(request, bucket, objectPath, access)
  } catch (error) {
    reportError(error, { message: 'Media proxy error' })
    return NextResponse.json(
      { error: 'Failed to load media' },
      {
        status: 500,
        headers: getCorsHeaders('private'),
      }
    )
  }
}
