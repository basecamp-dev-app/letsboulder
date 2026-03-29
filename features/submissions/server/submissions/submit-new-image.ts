import type { PreparedRoute, NewSubmissionImage } from '@/features/submissions/server/submissions/submit-route-validation'
import type { UnifiedSubmissionResult } from '@/features/submissions/server/submissions/submit-shared'
import type { ExecutorDependencies, RoutePayloadItem } from '@/features/submissions/server/submissions/submit-types'

export async function executeNewImageSubmission(input: ExecutorDependencies & {
  body: {
    cragId: string
    primaryIndex: number
    sectorId?: string | null
  }
  validatedNewImages: NewSubmissionImage[]
  primaryNewImage: NewSubmissionImage
  normalizedFaceDirectionsByImage: Record<number, string[]>
  routePayload: RoutePayloadItem[]
  normalizedRouteType: string | null
  preparedRoutes: PreparedRoute[]
}) {
  const { supabase, supabaseAdmin, body, validatedNewImages, primaryNewImage, normalizedFaceDirectionsByImage, routePayload, normalizedRouteType, preparedRoutes } = input

  const cleanupUploadedBlobs = validatedNewImages.map((img) => ({
    bucket: img.uploadedBucket,
    path: img.uploadedPath,
  }))

  const primaryPayload = {
    url: `private://${primaryNewImage.uploadedBucket}/${primaryNewImage.uploadedPath}`,
    storage_bucket: primaryNewImage.uploadedBucket,
    storage_path: primaryNewImage.uploadedPath,
    image_lat: primaryNewImage.gpsData?.latitude ?? null,
    image_lng: primaryNewImage.gpsData?.longitude ?? null,
    capture_date: primaryNewImage.captureDate,
    width: primaryNewImage.width,
    height: primaryNewImage.height,
    natural_width: primaryNewImage.naturalWidth,
    natural_height: primaryNewImage.naturalHeight,
    face_directions: normalizedFaceDirectionsByImage[body.primaryIndex] || [],
    sector_id: body.sectorId || null,
  }

  const supplementaryPayload = validatedNewImages
    .map((img, index) => ({ img, index }))
    .filter(({ index }) => index !== body.primaryIndex)
    .map(({ img, index }) => ({
      url: `private://${img.uploadedBucket}/${img.uploadedPath}`,
      width: img.width,
      height: img.height,
      face_directions: normalizedFaceDirectionsByImage[index] || [],
      sector_id: img.sectorId || null,
    }))

  const { data: unifiedData, error: unifiedError } = await supabase.rpc('create_unified_submission_atomic', {
    p_crag_id: body.cragId,
    p_primary_image: primaryPayload,
    p_supplementary_images: supplementaryPayload,
    p_routes: routePayload,
    p_route_type: normalizedRouteType || 'sport',
  })

  if (unifiedError) throw unifiedError

  const unifiedResult = (Array.isArray(unifiedData) ? unifiedData[0] : unifiedData) as UnifiedSubmissionResult | null
  if (!unifiedResult?.image_id) throw new Error('Unified submission did not return image_id')

  const imageId = unifiedResult.image_id
  const supplementaryCragImageIds = Array.isArray(unifiedResult.crag_image_ids) ? unifiedResult.crag_image_ids : []

  if (supplementaryCragImageIds.length > 0) {
    const imageClient = supabaseAdmin || supabase
    const updates = supplementaryPayload
      .map((supplementary, index) => {
        const cragImageId = supplementaryCragImageIds[index]
        if (!cragImageId) return null
        return {
          id: cragImageId,
          face_directions: supplementary.face_directions,
        }
      })
      .filter((item): item is { id: string; face_directions: string[] } => item !== null)

    for (const update of updates) {
      const { error: updateFaceDirectionsError } = await imageClient
        .from('crag_images')
        .update({ face_directions: update.face_directions })
        .eq('id', update.id)

      if (updateFaceDirectionsError) {
        return { error: input.createErrorResponse(updateFaceDirectionsError, 'Error applying face directions to supplementary image') }
      }
    }
  }

  const createdClimbIds = Array.isArray(unifiedResult.climb_ids) ? unifiedResult.climb_ids : []
  const createdRouteLineIds = Array.isArray(unifiedResult.route_line_ids) ? unifiedResult.route_line_ids : []
  let notificationClimbs: Array<{ id: string; name: string; grade: string }> = []

  if (createdClimbIds.length > 0) {
    const { data: createdClimbsRows } = await supabase
      .from('climbs')
      .select('id, name, grade')
      .in('id', createdClimbIds)

    notificationClimbs = (createdClimbsRows || []).map((row: { id: string; name: string | null; grade: string }) => ({
      id: row.id,
      name: row.name || 'Unnamed',
      grade: row.grade,
    }))
  }

  if (notificationClimbs.length === 0) {
    notificationClimbs = preparedRoutes.map((route, index) => ({
      id: `route-${index + 1}`,
      name: route.name,
      grade: route.grade,
    }))
  }

  return {
    result: {
      imageId,
      cragId: body.cragId,
      notificationClimbs,
      climbsCreatedCount: unifiedResult.climbs_created || 0,
      routeLinesCreatedCount: unifiedResult.route_lines_created || routePayload.length,
      supplementaryCreatedCount: unifiedResult.supplementary_created || 0,
      supplementaryCragImageIds,
      firstClimbId: createdClimbIds[0],
      firstRouteId: createdRouteLineIds[0],
      cleanupUploadedBlobs,
    },
  }
}
