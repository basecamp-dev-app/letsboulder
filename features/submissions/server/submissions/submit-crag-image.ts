import { NextResponse } from 'next/server'
import { parsePrivateStorageUrl } from '@/features/submissions/server/submissions/submission-route-shared'
import type { ExecutorDependencies, CragImageRow } from '@/features/submissions/server/submissions/submit-types'

export async function resolveCragImageToImageId(input: ExecutorDependencies & {
  cragImageId: string
  userId: string
}) {
  const { supabase, supabaseAdmin, cragImageId, userId } = input
  const { data: cragImage, error: cragImageError } = await supabase
    .from('crag_images')
    .select('id, url, crag_id, width, height, latitude, longitude, source_image_id, linked_image_id, source_image:source_image_id(id, latitude, longitude, capture_date)')
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

  let resolvedImageId = cragImageRow.linked_image_id
  const shouldCreateLinkedImage = !resolvedImageId || (cragImageRow.source_image_id && resolvedImageId === cragImageRow.source_image_id)

  if (shouldCreateLinkedImage) {
    const parsedStorage = parsePrivateStorageUrl(cragImageRow.url)
    const sourceImage = Array.isArray(cragImageRow.source_image)
      ? cragImageRow.source_image[0] || null
      : cragImageRow.source_image
    const latitude = typeof cragImageRow.latitude === 'number' ? cragImageRow.latitude : typeof sourceImage?.latitude === 'number' ? sourceImage.latitude : null
    const longitude = typeof cragImageRow.longitude === 'number' ? cragImageRow.longitude : typeof sourceImage?.longitude === 'number' ? sourceImage.longitude : null
    const captureDate = typeof sourceImage?.capture_date === 'string' && sourceImage.capture_date ? sourceImage.capture_date : null
    const uploadSessionUuid = parsedStorage?.path?.match(/images\/originals\/([0-9a-fA-F-]{36})/)?.[1]

    const insertPayload: Record<string, unknown> = {
      url: cragImageRow.url,
      crag_id: existingCragId,
      width: cragImageRow.width,
      height: cragImageRow.height,
      natural_width: cragImageRow.width,
      natural_height: cragImageRow.height,
      created_by: userId,
      latitude,
      longitude,
      capture_date: captureDate,
    }

    if (uploadSessionUuid) insertPayload.id = uploadSessionUuid
    if (parsedStorage) {
      insertPayload.storage_bucket = parsedStorage.bucket
      insertPayload.storage_path = parsedStorage.path
    }

    const imageClient = supabaseAdmin || supabase
    const { data: createdImage, error: createImageError } = await imageClient
      .from('images')
      .insert(insertPayload)
      .select('id')
      .single()

    if (createImageError || !createdImage) {
      return { error: input.createErrorResponse(createImageError || new Error('Failed to create linked image'), 'Error creating linked image') }
    }

    resolvedImageId = createdImage.id

    const linkingClient = supabaseAdmin || supabase
    const { error: linkError } = await linkingClient
      .from('crag_images')
      .update({ linked_image_id: resolvedImageId })
      .eq('id', cragImage.id)

    if (linkError) {
      return { error: input.createErrorResponse(linkError, 'Error linking crag image to created image') }
    }

    const { data: latestCragImage, error: latestCragImageError } = await linkingClient
      .from('crag_images')
      .select('linked_image_id')
      .eq('id', cragImage.id)
      .single()

    if (latestCragImageError) {
      return { error: input.createErrorResponse(latestCragImageError, 'Error verifying linked crag image') }
    }

    if (latestCragImage?.linked_image_id) {
      resolvedImageId = latestCragImage.linked_image_id
    } else {
      return { error: NextResponse.json({ error: 'Failed to persist crag image link' }, { status: 500 }) }
    }
  }

  return { imageId: resolvedImageId, cragId: existingCragId }
}
