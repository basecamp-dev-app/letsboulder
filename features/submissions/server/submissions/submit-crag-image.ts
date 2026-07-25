import { NextResponse } from 'next/server'
import { isMediaPubliclyDeliverable, MEDIA_NOT_READY_RESPONSE } from '@/lib/media/readiness'
import type { ExecutorDependencies, CragImageRow } from '@/features/submissions/server/submissions/submit-types'

export async function resolveCragImageToImageId(input: ExecutorDependencies & {
  cragImageId: string
  userId: string
}) {
  const { supabase, cragImageId } = input
  const { data: cragImage, error: cragImageError } = await supabase
    .from('crag_images')
    .select('id, url, crag_id, width, height, latitude, longitude, source_image_id, linked_image_id, linked_image:linked_image_id(id, processing_status, moderation_status, visibility, status), source_image:source_image_id(id, processing_status, moderation_status, visibility, status)')
    .eq('id', cragImageId)
    .single()

  if (cragImageError || !cragImage) {
    return { error: NextResponse.json({ error: 'Crag image not found' }, { status: 404 }) }
  }

  const cragImageRow = cragImage as CragImageRow
  const existingCragId = cragImageRow.crag_id
  if (!existingCragId) {
    return { error: NextResponse.json({ error: 'Crag image is not attached to a crag' }, { status: 400 }) }
  }

  const linkedImage = Array.isArray(cragImageRow.linked_image) ? cragImageRow.linked_image[0] : cragImageRow.linked_image
  const sourceImage = Array.isArray(cragImageRow.source_image) ? cragImageRow.source_image[0] : cragImageRow.source_image
  const resolvedImage = linkedImage || sourceImage
  if (!resolvedImage || !isMediaPubliclyDeliverable(resolvedImage)) {
    return { error: NextResponse.json(MEDIA_NOT_READY_RESPONSE, { status: 409 }) }
  }

  return { imageId: resolvedImage.id, cragId: existingCragId }
}
