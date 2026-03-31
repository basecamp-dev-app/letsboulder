import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { fileTypeFromBuffer } from 'file-type'
import { withCsrfProtection } from '@/lib/csrf-server'
import { createErrorResponse } from '@/lib/errors'
import { getSignedUrlBatchKey } from '@/lib/signed-url-batch'
import { createSignedObjectUrls } from '@/lib/media/object-urls'

export const runtime = 'nodejs'

const STORAGE_BUCKET = 'route-uploads'
const MAX_FILES = 8
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024
const SIGNATURE_BYTES_TO_READ = 4_100
const ALLOWED_IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp'])

type AllowedImageMime = 'image/jpeg' | 'image/png' | 'image/webp'

interface ValidatedUploadFile {
  buffer: Buffer
  mime: AllowedImageMime
  extension: string
  width: number
  height: number
}

interface CragImageRow {
  id: string
  url: string
  width: number | null
  height: number | null
  linked_image_id: string | null
  created_at: string
}

interface RouteTargetRow {
  id: string
  image_id: string
  climb_id: string
  climbs:
    | { slug: string | null }
    | Array<{ slug: string | null }>
    | null
}

function parsePrivateStorageUrl(url: string): { bucket: string; path: string } | null {
  if (!url.startsWith('private://')) return null
  const withoutScheme = url.slice('private://'.length)
  const slashIndex = withoutScheme.indexOf('/')
  if (slashIndex <= 0) return null

  const bucket = withoutScheme.slice(0, slashIndex)
  const path = withoutScheme.slice(slashIndex + 1)
  if (!bucket || !path) return null
  return { bucket, path }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const cookies = request.cookies
  const { id: cragId } = await params

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

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const supabaseAdmin = serviceRoleKey
    ? createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        serviceRoleKey,
        { cookies: { getAll() { return [] }, setAll() {} } }
      )
    : null

  try {
    if (!cragId) {
      return NextResponse.json({ error: 'Crag ID is required' }, { status: 400 })
    }

    const { data: existingCrag, error: cragError } = await supabase
      .from('crags')
      .select('id')
      .eq('id', cragId)
      .maybeSingle()

    if (cragError) {
      return createErrorResponse(cragError, 'Failed to validate crag')
    }

    if (!existingCrag) {
      return NextResponse.json({ error: 'Crag not found' }, { status: 404 })
    }

    const [{ data, error }, { data: cragData }, { data: routeTargetData, error: routeTargetError }] = await Promise.all([
      supabase
      .from('crag_images')
      .select('id, url, width, height, linked_image_id, created_at')
      .eq('crag_id', cragId)
      .order('created_at', { ascending: false })
      .limit(50),
      supabase
        .from('crags')
        .select('country_code, slug')
        .eq('id', cragId)
        .maybeSingle(),
      supabase
        .from('route_lines')
        .select('id, image_id, climb_id, climbs!inner(slug, crag_id)')
        .eq('climbs.crag_id', cragId)
        .order('image_id', { ascending: true })
        .order('sequence_order', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: true }),
    ])

    if (error) {
      return createErrorResponse(error, 'Failed to load crag images')
    }

    if (routeTargetError) {
      return createErrorResponse(routeTargetError, 'Failed to load route image targets')
    }

    const rows = (data || []) as CragImageRow[]
    const signingClient = supabaseAdmin || supabase
    const pathsByBucket = new Map<string, Set<string>>()

    for (const row of rows) {
      const parsed = parsePrivateStorageUrl(row.url)
      if (!parsed) continue

      const current = pathsByBucket.get(parsed.bucket) || new Set<string>()
      current.add(parsed.path)
      pathsByBucket.set(parsed.bucket, current)
    }

    const signedByKey = new Map<string, string>()

    for (const [bucket, pathSet] of pathsByBucket.entries()) {
      const paths = Array.from(pathSet)
      if (paths.length === 0) continue

      try {
        const signed = await createSignedObjectUrls(paths.map((path) => ({ bucket, path })), signingClient)
        for (const path of paths) {
          const signedUrl = signed.get(`${bucket}:${path}`)
          if (!signedUrl) continue
          signedByKey.set(getSignedUrlBatchKey(bucket, path), signedUrl)
        }
      } catch (signedError) {
        console.warn('Crag images batch signed URL generation failed:', {
          cragId,
          bucket,
          pathCount: paths.length,
          error: signedError,
        })
      }
    }

    const result: Array<CragImageRow & { signed_url: string | null }> = rows.map((row) => {
      const parsed = parsePrivateStorageUrl(row.url)
      if (!parsed) {
        return { ...row, signed_url: row.url }
      }

      return {
        ...row,
        signed_url: signedByKey.get(getSignedUrlBatchKey(parsed.bucket, parsed.path)) || null,
      }
    })

    const routeTargetByImageId = new Map<string, { climbId: string; routeId: string; climbSlug: string | null; imageId: string }>()
    for (const row of (routeTargetData || []) as RouteTargetRow[]) {
      if (routeTargetByImageId.has(row.image_id)) continue
      const climb = Array.isArray(row.climbs) ? row.climbs[0] : row.climbs
      routeTargetByImageId.set(row.image_id, {
        climbId: row.climb_id,
        routeId: row.id,
        climbSlug: climb?.slug || null,
        imageId: row.image_id,
      })
    }

    return NextResponse.json({
      crag: {
        country_code: cragData?.country_code || null,
        slug: cragData?.slug || null,
      },
      images: result.map((row) => ({
        ...row,
        display_image_id: row.linked_image_id || row.id,
        routeTarget: routeTargetByImageId.get(row.linked_image_id || row.id) || null,
      })),
    })
  } catch (error) {
    return createErrorResponse(error, 'Failed to fetch crag images')
  }
}

function readImageDimensions(buffer: Buffer, mime: AllowedImageMime): { width: number; height: number } | null {
  try {
    if (mime === 'image/jpeg') {
      return readJpegDimensions(buffer)
    }
    if (mime === 'image/png') {
      return readPngDimensions(buffer)
    }
    if (mime === 'image/webp') {
      return readWebpDimensions(buffer)
    }
  } catch {
    return null
  }
  return null
}

function readUShort(buffer: Buffer, offset: number, littleEndian: boolean): number {
  return littleEndian ? buffer.readUInt16LE(offset) : buffer.readUInt16BE(offset)
}

function readJpegDimensions(buffer: Buffer): { width: number; height: number } | null {
  if (buffer[0] !== 0xFF || buffer[1] !== 0xD8) return null

  let offset = 2
  while (offset < buffer.length - 1) {
    if (buffer[offset] !== 0xFF) {
      offset++
      continue
    }

    const marker = buffer[offset + 1]
    offset += 2

    if (marker === 0xFF) continue
    if (marker === 0xD9) break

    if (marker >= 0xC0 && marker <= 0xCF && marker !== 0xC4 && marker !== 0xC8 && marker !== 0xCC) {
      if (offset + 7 <= buffer.length) {
        const height = readUShort(buffer, offset + 3, false)
        const width = readUShort(buffer, offset + 5, false)
        return { width, height }
      }
    }

    if (offset + 2 > buffer.length) break
    const segmentLength = readUShort(buffer, offset, false)
    offset += segmentLength
  }

  return null
}

function readPngDimensions(buffer: Buffer): { width: number; height: number } | null {
  if (buffer[0] !== 0x89 || buffer[1] !== 0x50 || buffer[2] !== 0x4E || buffer[3] !== 0x47) return null

  const ihdrOffset = buffer.indexOf(Buffer.from('IHDR'))
  if (ihdrOffset < 0 || ihdrOffset + 12 > buffer.length) return null

  const width = buffer.readUInt32BE(ihdrOffset + 4)
  const height = buffer.readUInt32BE(ihdrOffset + 8)
  return { width, height }
}

function readWebpDimensions(buffer: Buffer): { width: number; height: number } | null {
  if (buffer.slice(0, 4).toString() !== 'RIFF' || buffer.slice(8, 12).toString() !== 'WEBP') return null

  const fourCC = buffer.slice(12, 16).toString()

  if (fourCC === 'VP8 ') {
    if (buffer.length < 26) return null
    const width = buffer.readUInt16LE(26) & 0x3FFF
    const height = buffer.readUInt16LE(28) & 0x3FFF
    return { width, height }
  }

  if (fourCC === 'VP8L') {
    if (buffer.length < 25) return null
    const bits = buffer.readUInt32LE(21)
    const width = (bits & 0x3FFF) + 1
    const height = ((bits >> 14) & 0x3FFF) + 1
    return { width, height }
  }

  if (fourCC === 'VP8X') {
    if (buffer.length < 30) return null
    const width = (buffer.readUIntLE(24, 3) & 0xFFFFFF) + 1
    const height = (buffer.readUIntLE(27, 3) & 0xFFFFFF) + 1
    return { width, height }
  }

  return null
}

function getExtensionForMime(mime: AllowedImageMime): string {
  if (mime === 'image/jpeg') return 'jpg'
  if (mime === 'image/png') return 'png'
  return 'webp'
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const csrfResult = await withCsrfProtection(request)
  if (!csrfResult.valid) return csrfResult.response!

  const cookies = request.cookies
  const { id: cragId } = await params

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
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    if (!cragId) {
      return NextResponse.json({ error: 'Crag ID is required' }, { status: 400 })
    }

    const { data: existingCrag, error: cragError } = await supabase
      .from('crags')
      .select('id')
      .eq('id', cragId)
      .maybeSingle()

    if (cragError) {
      return createErrorResponse(cragError, 'Failed to validate crag')
    }

    if (!existingCrag) {
      return NextResponse.json({ error: 'Crag not found' }, { status: 404 })
    }

    const formData = await request.formData()
    const fileValues = formData.getAll('images')
    const files = fileValues.filter((value): value is File => value instanceof File)

    if (files.length === 0) {
      return NextResponse.json({ error: 'At least one image is required' }, { status: 400 })
    }

    if (files.length > MAX_FILES) {
      return NextResponse.json({ error: `Maximum ${MAX_FILES} images allowed` }, { status: 400 })
    }

    const uploadedPaths: string[] = []
    const imageUrls: string[] = []
    const validatedFiles: ValidatedUploadFile[] = []

    try {
      for (const file of files) {
        if (file.size === 0) {
          return NextResponse.json({ error: 'Empty file uploaded' }, { status: 400 })
        }

        if (file.size > MAX_UPLOAD_BYTES) {
          return NextResponse.json({ error: 'File too large (max 10MB)' }, { status: 413 })
        }

        const signatureChunk = new Uint8Array(await file.slice(0, SIGNATURE_BYTES_TO_READ).arrayBuffer())
        const detectedType = await fileTypeFromBuffer(signatureChunk)

        if (!detectedType || !ALLOWED_IMAGE_MIMES.has(detectedType.mime)) {
          return NextResponse.json({ error: 'Invalid file signature' }, { status: 400 })
        }

        const mime = detectedType.mime as AllowedImageMime
        const extension = getExtensionForMime(mime)
        const fileBuffer = Buffer.from(await file.arrayBuffer())

        const dims = readImageDimensions(fileBuffer, mime)
        if (!dims) {
          return NextResponse.json({ error: 'Could not read image dimensions' }, { status: 400 })
        }

        validatedFiles.push({
          buffer: fileBuffer,
          mime,
          extension,
          width: dims.width,
          height: dims.height,
        })
      }

      for (const file of validatedFiles) {
        const objectPath = `${user.id}/crags/${cragId}/${crypto.randomUUID()}.${file.extension}`

        const { error: uploadError } = await supabase.storage
          .from(STORAGE_BUCKET)
          .upload(objectPath, file.buffer, {
            contentType: file.mime,
            upsert: false,
          })

        if (uploadError) {
          throw uploadError
        }

        uploadedPaths.push(objectPath)
        imageUrls.push(`private://${STORAGE_BUCKET}/${objectPath}`)
      }

      const insertRows = imageUrls.map((url, index) => {
        const width = validatedFiles[index]?.width ?? null
        const height = validatedFiles[index]?.height ?? null
        return { crag_id: cragId, url, width, height }
      })

      const { data: insertedRows, error: insertError } = await supabase
        .from('crag_images')
        .insert(insertRows)
        .select('id, url, width, height, linked_image_id, created_at')

      if (insertError) {
        throw insertError
      }

      return NextResponse.json({ success: true, images: insertedRows || [] }, { status: 201 })
    } catch (uploadOrInsertError) {
      if (uploadedPaths.length > 0) {
        await supabase.storage.from(STORAGE_BUCKET).remove(uploadedPaths)
      }

      return createErrorResponse(uploadOrInsertError, 'Failed to upload crag images')
    }
  } catch (error) {
    return createErrorResponse(error, 'Failed to process crag image upload')
  }
}
