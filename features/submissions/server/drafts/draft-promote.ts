import { NextResponse } from 'next/server'
import { serverEnv } from '@/lib/env.server'
import { createErrorResponse, reportError } from '@/lib/errors'
import { notifyNewSubmission } from '@/lib/discord'
import { getMediaModerationConfig } from '@/lib/media/config'
import { recordSubmissionPublishedEvent } from '@/features/community/lib/contributor-score'
import { extractDraftLocation, hasValidDraftCoordinate, isPermissionDeniedError, normalizeJsonRecord, resolveEffectiveDraftPublishLocation, type DraftImageRow } from '@/features/submissions/server/drafts/draft-route-shared'

const INTERNAL_MODERATION_SECRET = serverEnv.INTERNAL_MODERATION_SECRET

interface PromoteResult {
  success?: boolean
  status?: string
  image_id?: string
  default_image_id?: string
  image_ids?: string[]
  climb_ids?: string[]
  route_line_ids?: string[]
  published_at?: string
}

interface DraftRouteRef {
  id: string
  draft_image_id: string
}

type DraftImagePublishRow = Pick<DraftImageRow, 'id' | 'latitude' | 'longitude' | 'route_data'>

interface DraftRouteSyncPayload {
  id: string
  name: string
  grade: string
  description: string | null
  climbType: string
  points: Array<{ x: number; y: number }>
  sequenceOrder: number
  imageWidth: number | null
  imageHeight: number | null
}

function normalizeDraftRouteSyncPayload(value: unknown): DraftRouteSyncPayload[] {
  if (!Array.isArray(value)) return []

  return value.flatMap((item, index) => {
    if (!item || typeof item !== 'object') return []
    const candidate = item as Record<string, unknown>
    const id = typeof candidate.id === 'string' && candidate.id.length > 0 ? candidate.id : ''
    const points = Array.isArray(candidate.points)
      ? candidate.points.flatMap((point) => {
          if (!point || typeof point !== 'object') return []
          const parsedPoint = point as Record<string, unknown>
          return typeof parsedPoint.x === 'number' && typeof parsedPoint.y === 'number'
            ? [{ x: parsedPoint.x, y: parsedPoint.y }]
            : []
        })
      : []

    if (!id || points.length < 2) return []

    const climbType = typeof candidate.climbType === 'string' && candidate.climbType.length > 0
      ? candidate.climbType
      : 'sport'

    return [{
      id,
      name: typeof candidate.name === 'string' ? candidate.name : '',
      grade: typeof candidate.grade === 'string' ? candidate.grade : '',
      description: typeof candidate.description === 'string' ? candidate.description : null,
      climbType,
      points,
      sequenceOrder: typeof candidate.sequenceOrder === 'number' ? candidate.sequenceOrder : index,
      imageWidth: typeof candidate.imageWidth === 'number' ? candidate.imageWidth : null,
      imageHeight: typeof candidate.imageHeight === 'number' ? candidate.imageHeight : null,
    }]
  })
}

export async function promoteDraftToSubmission(input: {
  supabase: ReturnType<typeof import('@supabase/ssr').createServerClient>
  request: Request
  draftId: string
  userId: string
}) {
  const { supabase, request, draftId, userId } = input
  const { data: draft, error: draftError } = await supabase
    .from('submission_drafts')
    .select('id, user_id, metadata')
    .eq('id', draftId)
    .maybeSingle()

  if (draftError) {
    return createErrorResponse(draftError, 'Failed to validate draft before publish')
  }

  if (!draft) {
    return NextResponse.json({ error: 'Draft not found' }, { status: 404 })
  }

  if (draft.user_id !== userId) {
    return NextResponse.json({ error: 'Only the draft owner can publish this draft' }, { status: 403 })
  }

  const { data: draftImages, error: draftImagesError } = await supabase
    .from('submission_draft_images')
    .select('id, latitude, longitude, route_data')
    .eq('draft_id', draftId)

  if (draftImagesError) {
    return createErrorResponse(draftImagesError, 'Failed to validate draft images before publish')
  }

  const draftImageRows = (draftImages || []) as DraftImagePublishRow[]
  const draftLocation = extractDraftLocation(draft.metadata)
  const effectiveDraftLocation = resolveEffectiveDraftPublishLocation(draft.metadata, draftImageRows)
  const hasValidLocation = hasValidDraftCoordinate(effectiveDraftLocation.latitude, effectiveDraftLocation.longitude)

  if (!hasValidLocation) {
    return NextResponse.json({ error: 'Add climb location before publishing this draft' }, { status: 400 })
  }

  if (!hasValidDraftCoordinate(draftLocation.latitude, draftLocation.longitude)) {
    const draftMetadata = draft.metadata && typeof draft.metadata === 'object' && !Array.isArray(draft.metadata)
      ? draft.metadata as Record<string, unknown>
      : {}
    const existingSubmission = draftMetadata.submission && typeof draftMetadata.submission === 'object' && !Array.isArray(draftMetadata.submission)
      ? draftMetadata.submission as Record<string, unknown>
      : {}

    const { error: repairDraftLocationError } = await supabase
      .from('submission_drafts')
      .update({
        metadata: {
          ...draftMetadata,
          submission: {
            ...existingSubmission,
            location: {
              latitude: effectiveDraftLocation.latitude,
              longitude: effectiveDraftLocation.longitude,
            },
          },
        },
      })
      .eq('id', draftId)
      .eq('user_id', userId)

    if (repairDraftLocationError) {
      return createErrorResponse(repairDraftLocationError, 'Failed to repair draft location before publish')
    }
  }

  const { data: draftRoutes, error: draftRoutesError } = await supabase
    .from('submission_draft_routes')
    .select('id, draft_image_id')
    .eq('draft_id', draftId)

  if (draftRoutesError) {
    return createErrorResponse(draftRoutesError, 'Failed to validate draft routes before publish')
  }

  const draftImageIds = draftImageRows.map((image) => image.id)

  const resolveImagesMissingRoutes = (routeRefs: DraftRouteRef[]) => {
    const routeImageIds = new Set(routeRefs.map((route) => route.draft_image_id))
    return draftImageIds.filter((imageId) => !routeImageIds.has(imageId))
  }

  let routeRows = (draftRoutes || []) as DraftRouteRef[]
  let imagesMissingRoutes = resolveImagesMissingRoutes(routeRows)

  if (imagesMissingRoutes.length > 0) {
    for (const imageId of imagesMissingRoutes) {
      const imageRow = draftImageRows.find((image) => image.id === imageId) || null
      const routeData = normalizeJsonRecord(imageRow?.route_data)
      const completedRoutes = normalizeDraftRouteSyncPayload(routeData?.completedRoutes)
      if (completedRoutes.length === 0) continue

      const { error } = await supabase.rpc('sync_submission_draft_routes', {
        p_draft_id: draftId,
        p_draft_image_id: imageId,
        p_routes: completedRoutes,
      })

      if (error) {
        return createErrorResponse(error, 'Failed to repair draft routes before publish')
      }
    }

    const { data: repairedDraftRoutes, error: repairedDraftRoutesError } = await supabase
      .from('submission_draft_routes')
      .select('id, draft_image_id')
      .eq('draft_id', draftId)

    if (repairedDraftRoutesError) {
      return createErrorResponse(repairedDraftRoutesError, 'Failed to validate repaired draft routes before publish')
    }

    routeRows = (repairedDraftRoutes || []) as DraftRouteRef[]
    imagesMissingRoutes = resolveImagesMissingRoutes(routeRows)
  }

  const { data, error } = await supabase.rpc('promote_draft_to_submission', { p_draft_id: draftId })
  if (error) {
    if (typeof error.message === 'string' && error.message.includes('Draft location is required before publishing')) {
      return NextResponse.json({ error: 'Add climb location before publishing this draft' }, { status: 400 })
    }
    if (isPermissionDeniedError(error)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    return createErrorResponse(error, 'Failed to publish draft')
  }

  const result = (Array.isArray(data) ? data[0] : data) as PromoteResult | null
  if (!result?.success || !result.image_id) {
    return NextResponse.json({ error: 'Failed to publish draft' }, { status: 500 })
  }

  const defaultImageId = result.default_image_id || result.image_id
  const { data: canonicalImage, error: canonicalImageError } = await supabase
    .from('images')
    .select('id, crag_id, crags(name, country_code, slug), route_lines(id, climb_id, sequence_order, created_at)')
    .eq('id', defaultImageId)
    .maybeSingle()

  if (canonicalImageError || !canonicalImage) {
    return createErrorResponse(canonicalImageError || new Error('Failed to resolve canonical image path after publish'), 'Failed to resolve publish destination')
  }

  const crag = Array.isArray(canonicalImage.crags) ? canonicalImage.crags[0] : canonicalImage.crags
  if (!crag?.country_code || !crag?.slug) {
    return NextResponse.json({ error: 'Failed to resolve canonical crag path after publish' }, { status: 500 })
  }

  const cragId = typeof canonicalImage.crag_id === 'string' ? canonicalImage.crag_id : null

  const climbIds = Array.isArray(result.climb_ids)
    ? result.climb_ids.filter((climbId): climbId is string => typeof climbId === 'string' && climbId.length > 0)
    : []

  const notificationClimbs = climbIds.length > 0
    ? await (async () => {
      const { data: climbRows } = await supabase
        .from('climbs')
        .select('id, name, grade')
        .in('id', climbIds)

      const climbMap = new Map<string, { id: string; name: string; grade: string }>()
      for (const row of (climbRows || []) as Array<{ id: string; name: string | null; grade: string }>) {
        climbMap.set(row.id, {
          id: row.id,
          name: row.name || 'Unnamed',
          grade: row.grade,
        })
      }

      return climbIds.map((climbId, index) => climbMap.get(climbId) || {
        id: climbId,
        name: `Route ${index + 1}`,
        grade: 'Unknown',
      })
    })()
    : []

  if (notificationClimbs.length > 0 && cragId) {
    const cragName = typeof crag.name === 'string' && crag.name.trim().length > 0 ? crag.name : 'Unknown Crag'

    await notifyNewSubmission(supabase, notificationClimbs, cragName, cragId, userId).catch((error) => {
      reportError(error, { message: 'Discord notification error' })
    })
  }

  const routeLines = Array.isArray(canonicalImage.route_lines) ? canonicalImage.route_lines : []
  const defaultRoute = routeLines.slice().sort((left: { sequence_order: number | null; created_at: string | null }, right: { sequence_order: number | null; created_at: string | null }) => {
    const leftSequence = typeof left.sequence_order === 'number' ? left.sequence_order : Number.MAX_SAFE_INTEGER
    const rightSequence = typeof right.sequence_order === 'number' ? right.sequence_order : Number.MAX_SAFE_INTEGER
    if (leftSequence !== rightSequence) return leftSequence - rightSequence
    return String(left.created_at || '').localeCompare(String(right.created_at || ''))
  })[0] || null

  const canonicalPath = `/${crag.country_code.toLowerCase()}/${crag.slug}/i/${defaultImageId}`

  await recordSubmissionPublishedEvent(supabase, {
    userId,
    imageId: defaultImageId,
    sourceId: defaultImageId,
  }).catch((contributorScoreError) => {
    reportError(contributorScoreError, { message: 'Contributor score publish event error' })
  })

  const moderationConfig = getMediaModerationConfig()
  if (INTERNAL_MODERATION_SECRET && moderationConfig.enabled) {
    const csrfToken = request.headers.get('x-csrf-token')
    const cookieHeader = request.headers.get('cookie')
    const moderationHeaders: Record<string, string> = {
      'content-type': 'application/json',
      'x-internal-secret': INTERNAL_MODERATION_SECRET,
    }

    if (csrfToken) moderationHeaders['x-csrf-token'] = csrfToken
    if (cookieHeader) moderationHeaders.cookie = cookieHeader

    fetch(new URL('/api/moderation/check', request.url), {
      method: 'POST',
      headers: moderationHeaders,
      body: JSON.stringify({ imageId: result.image_id }),
    })
      .then(async (res) => {
        if (res.ok) return
        const text = await res.text().catch(() => '')
        reportError(new Error('Failed to queue moderation for published draft'), {
          message: 'Failed to queue moderation for published draft',
          extra: {
            draftId,
            imageId: result.image_id,
            status: res.status,
            body: text.slice(0, 500),
          },
        })
      })
      .catch((queueError) => reportError(queueError, {
        message: 'Failed to queue moderation for published draft',
        extra: {
          draftId,
          imageId: result.image_id,
        },
      }))
  }

  return NextResponse.json({
    success: true,
    status: result.status || 'submitted',
    published: {
      defaultImageId,
      imageId: result.image_id,
      imageIds: Array.isArray(result.image_ids) ? result.image_ids : (result.image_id ? [result.image_id] : []),
      climbIds: Array.isArray(result.climb_ids) ? result.climb_ids : [],
      routeLineIds: Array.isArray(result.route_line_ids) ? result.route_line_ids : [],
      publishedAt: result.published_at || null,
      canonicalPath,
      countryCode: crag.country_code.toLowerCase(),
      cragSlug: crag.slug,
      defaultRouteId: defaultRoute?.id || null,
    },
  })
}
