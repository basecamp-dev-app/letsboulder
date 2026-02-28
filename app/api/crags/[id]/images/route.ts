import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { fileTypeFromBuffer } from 'file-type'
import sharp from 'sharp'
import { withCsrfProtection } from '@/lib/csrf-server'
import { createErrorResponse } from '@/lib/errors'
import { getSignedUrlBatchKey, type SignedUrlBatchResponse } from '@/lib/signed-url-batch'

export const runtime = 'nodejs'

const STORAGE_BUCKET = 'route-uploads'
const MAX_FILES = 8
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024
const MAX_IMAGE_PIXELS = 40_000_000
const MAX_IMAGE_DIMENSION = 8_000
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

    const { data, error } = await supabase
      .from('crag_images')
      .select('id, url, width, height, linked_image_id, created_at')
      .eq('crag_id', cragId)
      .order('created_at', { ascending: false })
      .limit(50)

    if (error) {
      return createErrorResponse(error, 'Failed to load crag images')
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

      const { data: signedData, error: signedError } = await signingClient.storage
        .from(bucket)
        .createSignedUrls(paths, 3600)

      if (signedError) {
        console.warn('Crag images batch signed URL generation failed:', {
          cragId,
          bucket,
          pathCount: paths.length,
          error: signedError,
        })
        continue
      }

      const bucketResults: NonNullable<SignedUrlBatchResponse['results']> = []
      for (const item of signedData || []) {
        if (typeof item.path !== 'string') continue
        bucketResults.push({
          bucket,
          path: item.path,
          signedUrl: item.signedUrl || null,
        })
      }
      const payload: SignedUrlBatchResponse = { results: bucketResults }

      for (const result of payload.results || []) {
        if (!result.signedUrl) continue
        signedByKey.set(getSignedUrlBatchKey(result.bucket, result.path), result.signedUrl)
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

    return NextResponse.json({ images: result })
  } catch (error) {
    return createErrorResponse(error, 'Failed to fetch crag images')
  }
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

        try {
          const metadata = await sharp(fileBuffer, {
            failOn: 'error',
            limitInputPixels: MAX_IMAGE_PIXELS,
          }).metadata()

          const width = metadata.width
          const height = metadata.height

          if (!width || !height) {
            return NextResponse.json({ error: 'Could not read image dimensions' }, { status: 400 })
          }

          if (width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION || (width * height) > MAX_IMAGE_PIXELS) {
            return NextResponse.json({ error: 'Image dimensions exceed upload limits' }, { status: 400 })
          }

          validatedFiles.push({
            buffer: fileBuffer,
            mime,
            extension,
            width,
            height,
          })
        } catch {
          return NextResponse.json({ error: 'Invalid image payload' }, { status: 400 })
        }
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
