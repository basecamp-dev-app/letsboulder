import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { withApiMiddleware } from '@/lib/csrf-server'
import { createErrorResponse } from '@/lib/errors'

import { parseWithSchema } from '@/lib/api-validation'

interface AttachCragImageInput {
  uploaded_image_id: string
}

interface UploadedImageRow {
  id: string
  created_by: string | null
  storage_bucket: string | null
  storage_path: string | null
  width: number | null
  height: number | null
  latitude: number | null
  longitude: number | null
}

const attachCragImagesSchema = z.object({
  images: z.array(z.object({ uploaded_image_id: z.string().min(1) })).min(1, 'images must be a non-empty array of uploaded_image_id values'),
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

    const uploadedImageIds = images.map((image) => image.uploaded_image_id)
    const { data: uploadedRows, error: uploadedError } = await supabase
      .from('images')
      .select('id, created_by, storage_bucket, storage_path, width, height, latitude, longitude, capture_date')
      .in('id', uploadedImageIds)

    if (uploadedError) {
      return createErrorResponse(uploadedError, 'Failed to load uploaded images')
    }

    const uploadedById = new Map<string, UploadedImageRow>()
    for (const row of (uploadedRows || []) as UploadedImageRow[]) {
      uploadedById.set(row.id, row)
    }

    const insertRows = uploadedImageIds.map((imageId) => {
      const uploaded = uploadedById.get(imageId)
      if (!uploaded) {
        throw new Error(`Uploaded image not found: ${imageId}`)
      }

      if (uploaded.created_by !== userId) {
        throw new Error('Unauthorized uploaded image')
      }

      if (!uploaded.storage_bucket || !uploaded.storage_path) {
        throw new Error('Uploaded image storage path is incomplete')
      }

      return {
        crag_id: cragId,
        url: `private://${uploaded.storage_bucket}/${uploaded.storage_path}`,
        width: uploaded.width,
        height: uploaded.height,
        latitude: uploaded.latitude,
        longitude: uploaded.longitude,
        source_image_id: uploaded.id,
        linked_image_id: uploaded.id,
      }
    })

    const { data: insertedRows, error: insertError } = await supabase
      .from('crag_images')
      .insert(insertRows)
      .select('id, crag_id, url, width, height, source_image_id, linked_image_id, created_at')

    if (insertError) {
      return createErrorResponse(insertError, 'Failed to attach crag images')
    }

    return NextResponse.json({ success: true, images: insertedRows || [] }, { status: 201 })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized uploaded image') {
      return NextResponse.json({ error: 'Unauthorized uploaded image' }, { status: 403 })
    }

    if (error instanceof Error && error.message.startsWith('Uploaded image')) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return createErrorResponse(error, 'Failed to attach crag images')
  }
}
