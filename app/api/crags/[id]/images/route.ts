import { NextRequest, NextResponse } from 'next/server'
import { getServerClientFromRequest } from '@/lib/supabase-server'
import { fileTypeFromBuffer } from 'file-type'
import { withApiMiddleware } from '@/lib/csrf-server'
import { createErrorResponse } from '@/lib/errors'
import { z } from 'zod'
import { parseWithSchema } from '@/lib/api-validation'
import { loadCragImages } from '@/features/crags/server'

export const runtime = 'nodejs'

const STORAGE_BUCKET = 'route-uploads'
const MAX_FILES = 8
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024
const SIGNATURE_BYTES_TO_READ = 4_100
const ALLOWED_IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp'])

const cragImagesParamsSchema = z.object({
  id: z.string().min(1, 'id is required'),
})

type AllowedImageMime = 'image/jpeg' | 'image/png' | 'image/webp'

interface ValidatedUploadFile {
  buffer: Buffer
  mime: AllowedImageMime
  extension: string
  width: number
  height: number
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const rawParams = await params
  const validation = parseWithSchema(cragImagesParamsSchema, rawParams)
  if (!validation.success) return validation.response

  const { id: cragId } = validation.data

  const supabase = getServerClientFromRequest(request)

  return loadCragImages(supabase, cragId)
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
  const middlewareResult = await withApiMiddleware(request, {
    requireUser: false,
    rateLimitKey: 'authenticatedWrite',
  })
  if (!middlewareResult.ok) return middlewareResult.response

  const rawParams = await params
  const validation = parseWithSchema(cragImagesParamsSchema, rawParams)
  if (!validation.success) return validation.response

  const { id: cragId } = validation.data

  const { supabase } = middlewareResult

  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
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
