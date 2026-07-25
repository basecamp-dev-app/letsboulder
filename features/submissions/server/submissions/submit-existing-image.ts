import { NextResponse } from 'next/server'
import { isMediaNotReadyError, isMediaPubliclyDeliverable, MEDIA_NOT_READY_RESPONSE } from '@/lib/media/readiness'
import type { AtomicSubmissionRouteResult } from '@/features/submissions/server/submissions/submit-shared'
import type { ExecutorDependencies, RoutePayloadItem } from '@/features/submissions/server/submissions/submit-types'

export async function executeExistingImageSubmission(input: ExecutorDependencies & {
  imageId: string
  cragId: string | null
  routePayload: RoutePayloadItem[]
  normalizedRouteType: string | null
}) {
  const { supabase, imageId, cragId, routePayload, normalizedRouteType } = input
  const { data: image, error: imageError } = await supabase
    .from('images')
    .select('processing_status, moderation_status, visibility, status')
    .eq('id', imageId)
    .maybeSingle()

  if (imageError) return { error: input.createErrorResponse(imageError, 'Error validating submission media') }
  if (!image || !isMediaPubliclyDeliverable(image)) {
    return { error: NextResponse.json(MEDIA_NOT_READY_RESPONSE, { status: 409 }) }
  }

  const { data: climbs, error: atomicError } = await supabase.rpc('create_submission_routes_atomic', {
    p_image_id: imageId,
    p_crag_id: cragId,
    p_route_type: normalizedRouteType || 'sport',
    p_routes: routePayload,
  })

  if (atomicError) {
    if (isMediaNotReadyError(atomicError)) {
      return { error: NextResponse.json(MEDIA_NOT_READY_RESPONSE, { status: 409 }) }
    }
    return { error: input.createErrorResponse(atomicError, 'Error creating submission routes') }
  }

  const createdClimbs = (climbs || []) as AtomicSubmissionRouteResult[]
  if (!Array.isArray(createdClimbs) || createdClimbs.length === 0) {
    return { error: NextResponse.json({ error: 'Failed to create climbs' }, { status: 500 }) }
  }

  const notificationClimbs = createdClimbs.map((climb) => ({
    id: climb.climb_id,
    name: climb.name,
    grade: climb.grade,
  }))

  const createdClimbIds = createdClimbs.map((climb) => climb.climb_id)
  let firstClimbId = createdClimbIds[0]
  let firstRouteId: string | undefined

  if (imageId && createdClimbIds.length > 0) {
    const { data: createdRouteRows } = await supabase
      .from('route_lines')
      .select('id, climb_id')
      .eq('image_id', imageId)
      .in('climb_id', createdClimbIds)
      .order('sequence_order', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true })

    const firstRouteRow = (createdRouteRows || [])[0]
    if (firstRouteRow?.id) {
      firstRouteId = firstRouteRow.id
      if (!firstClimbId && firstRouteRow.climb_id) {
        firstClimbId = firstRouteRow.climb_id
      }
    }
  }

  return {
    result: {
      imageId,
      cragId,
      notificationClimbs,
      climbsCreatedCount: createdClimbs.length,
      routeLinesCreatedCount: routePayload.length,
      supplementaryCreatedCount: 0,
      supplementaryCragImageIds: [],
      firstClimbId,
      firstRouteId,
    },
  }
}
