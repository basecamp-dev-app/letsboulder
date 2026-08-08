import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { withApiMiddleware } from '@/lib/csrf-server'
import { createErrorResponse } from '@/lib/errors'
import { isMediaPubliclyDeliverable, MEDIA_NOT_READY_CODE, MEDIA_NOT_READY_RESPONSE } from '@/lib/media/readiness'
import { parseWithSchema } from '@/lib/api-validation'
import { revalidatePublicCrag } from '@/features/crags/server/crag-cache-tags'
import type { Database } from '@/types/database'

interface AttachCragImageInput {
  uploaded_image_id: string
}

type UploadedImageRow = Pick<Database['public']['Tables']['images']['Row'],
  'id' | 'created_by' | 'optimized_bucket' | 'optimized_key' | 'optimized_mime' | 'optimized_bytes' |
  'optimized_width' | 'optimized_height' | 'latitude' | 'longitude' | 'processing_status' |
  'moderation_status' | 'visibility' | 'status' | 'upload_purpose' | 'upload_crag_id' | 'variants' | 'url'>

type CragImageRow = Pick<Database['public']['Tables']['crag_images']['Row'],
  'id' | 'crag_id' | 'url' | 'width' | 'height' | 'source_image_id' | 'linked_image_id' | 'created_at'>

const attachCragImagesSchema = z.object({
  images: z.array(z.object({ uploaded_image_id: z.string().uuid() })).min(1, 'images must be a non-empty array of uploaded_image_id values'),
})

function normalizeImages(value: unknown): AttachCragImageInput[] | null {
  if (!Array.isArray(value) || value.length === 0) return null

  const normalized: AttachCragImageInput[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') return null
    const candidate = item as Partial<AttachCragImageInput>
    if (typeof candidate.uploaded_image_id !== 'string' || !candidate.uploaded_image_id) return null
    normalized.push({ uploaded_image_id: candidate.uploaded_image_id })
  }

  return normalized
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const middlewareResult = await withApiMiddleware(request, {
    unauthorizedMessage: 'Authentication required',
    rateLimitKey: 'authenticatedWrite',
  })
  if (!middlewareResult.ok) return middlewareResult.response

  const { id: cragId } = await params
  if (!cragId) {
    return NextResponse.json({ error: 'Crag ID is required' }, { status: 400 })
  }

  const { supabase, userId } = middlewareResult

  try {
    const parsedBody = parseWithSchema(attachCragImagesSchema, await request.json().catch(() => null))
    if (!parsedBody.success) return parsedBody.response

    const images = normalizeImages(parsedBody.data.images)
    if (!images) {
      return NextResponse.json({ error: 'images must be a non-empty array of uploaded_image_id values' }, { status: 400 })
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

    const uploadedImageIds = Array.from(new Set(images.map((image) => image.uploaded_image_id)))
    const { data: uploadedRows, error: uploadedError } = await supabase
      .from('images')
      .select('id, created_by, optimized_bucket, optimized_key, optimized_mime, optimized_bytes, optimized_width, optimized_height, latitude, longitude, processing_status, moderation_status, visibility, status, upload_purpose, upload_crag_id, variants, url')
      .in('id', uploadedImageIds)

    if (uploadedError) {
      return createErrorResponse(uploadedError, 'Failed to load uploaded images')
    }

    const uploadedById = new Map<string, UploadedImageRow>()
    for (const row of (uploadedRows || []) as UploadedImageRow[]) {
      uploadedById.set(row.id, row)
    }

    for (const imageId of uploadedImageIds) {
      const uploaded = uploadedById.get(imageId)
      if (!uploaded) throw new Error(`Uploaded image not found: ${imageId}`)
      if (uploaded.created_by !== userId) throw new Error('Unauthorized uploaded image')
      if (uploaded.upload_purpose !== 'crag_image' || uploaded.upload_crag_id !== cragId) {
        throw new Error('Uploaded image is not authorized for this crag')
      }
      if (!isMediaPubliclyDeliverable(uploaded)
        || !uploaded.optimized_bucket
        || !uploaded.optimized_key
        || uploaded.optimized_mime !== 'image/webp'
        || (uploaded.optimized_bytes ?? 0) <= 0
        || (uploaded.optimized_width ?? 0) <= 0
        || (uploaded.optimized_height ?? 0) <= 0
        || !uploaded.variants
        || typeof uploaded.variants !== 'object'
        || Array.isArray(uploaded.variants)
        || !uploaded.url) {
        throw new Error(MEDIA_NOT_READY_CODE)
      }
    }

    const { data: existingRows, error: existingError } = await supabase
      .from('crag_images')
      .select('id, crag_id, url, width, height, source_image_id, linked_image_id, created_at')
      .eq('crag_id', cragId)
      .or(`linked_image_id.in.(${uploadedImageIds.join(',')}),source_image_id.in.(${uploadedImageIds.join(',')})`)

    if (existingError) {
      return createErrorResponse(existingError, 'Failed to resolve attached crag images')
    }

    const existingImageIds = new Set((existingRows || []).flatMap((row) => [row.linked_image_id, row.source_image_id].filter((id): id is string => Boolean(id))))
    const insertRows = uploadedImageIds.filter((imageId) => !existingImageIds.has(imageId)).map((imageId) => {
      const uploaded = uploadedById.get(imageId) as UploadedImageRow & {
        optimized_bucket: string
        optimized_key: string
        optimized_width: number
        optimized_height: number
      }

      return {
        crag_id: cragId,
        url: uploaded.url,
        width: uploaded.optimized_width,
        height: uploaded.optimized_height,
        latitude: uploaded.latitude,
        longitude: uploaded.longitude,
        source_image_id: uploaded.id,
        linked_image_id: uploaded.id,
      }
    })

    let insertedRows: CragImageRow[] = []
    if (insertRows.length > 0) {
      const { data, error: insertError } = await supabase
        .from('crag_images')
        .insert(insertRows)
        .select('id, crag_id, url, width, height, source_image_id, linked_image_id, created_at')

      if (insertError) {
        return createErrorResponse(insertError, 'Failed to attach crag images')
      }
      insertedRows = (data || []) as CragImageRow[]
    }

    revalidatePublicCrag(cragId)
    return NextResponse.json({ success: true, images: [...(existingRows || []), ...insertedRows] }, { status: insertRows.length > 0 ? 201 : 200 })
  } catch (error) {
    if (error instanceof Error && error.message === MEDIA_NOT_READY_CODE) {
      return NextResponse.json(MEDIA_NOT_READY_RESPONSE, { status: 409 })
    }
    if (error instanceof Error && error.message === 'Unauthorized uploaded image') {
      return NextResponse.json({ error: 'Unauthorized uploaded image' }, { status: 403 })
    }

    if (error instanceof Error && error.message === 'Uploaded image is not authorized for this crag') {
      return NextResponse.json({ error: error.message }, { status: 403 })
    }

    if (error instanceof Error && error.message.startsWith('Uploaded image')) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return createErrorResponse(error, 'Failed to attach crag images')
  }
}
