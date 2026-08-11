import { NextResponse } from 'next/server'
import { createErrorResponse, reportError } from '@/lib/errors'
import { notifyNewSubmission } from '@/lib/discord'
import { isMediaNotReadyError, isMediaPubliclyDeliverable, MEDIA_NOT_READY_RESPONSE } from '@/lib/media/readiness'
import { resolveCountryFromCoordinates } from '@/lib/location/resolve-country'
import { getAdminClientWithAudit } from '@/lib/supabase-admin'
import { recordSubmissionPublishedEvent } from '@/features/community/public-server'
import { extractDraftLocation, hasValidDraftCoordinate, isPermissionDeniedError, normalizeJsonRecord, resolveEffectiveDraftPublishLocation, type DraftImageRow } from '@/features/submissions/server/drafts/draft-route-shared'
import { OPEN_DATA_CONSENT_REQUIRED } from '@/features/legal/public-server'
import { revalidatePublicCragPaths } from '@/features/crags/public-server'

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

type DraftSupabaseClient = ReturnType<typeof import('@supabase/ssr').createServerClient>

function normalizeStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.length > 0)
    : []
}

function resolvePublishedResult(metadata: unknown): PromoteResult | null {
  const safeMetadata = normalizeJsonRecord(metadata)
  const imageId = typeof safeMetadata?.publishedImageId === 'string' ? safeMetadata.publishedImageId : null
  if (!imageId) return null

  return {
    success: true,
    status: 'submitted',
    image_id: imageId,
    default_image_id: imageId,
    image_ids: normalizeStringArray(safeMetadata?.allPublishedImageIds),
    climb_ids: normalizeStringArray(safeMetadata?.publishedClimbIds),
    route_line_ids: normalizeStringArray(safeMetadata?.publishedRouteLineIds),
    published_at: typeof safeMetadata?.publishedAt === 'string' ? safeMetadata.publishedAt : undefined,
  }
}

async function ensureCanonicalCrag(input: {
  supabase: DraftSupabaseClient
  cragId: string | null
  draftId: string
  userId: string
  latitude: number | null
  longitude: number | null
}): Promise<NextResponse | null> {
  const { supabase, cragId, draftId, userId, latitude, longitude } = input
  if (!cragId) {
    return NextResponse.json({ error: 'Select a crag before publishing this draft' }, { status: 400 })
  }

  const { data: crag, error: cragError } = await supabase
    .from('crags')
    .select('id, country_code, slug, latitude, longitude')
    .eq('id', cragId)
    .maybeSingle()

  if (cragError || !crag) {
    return createErrorResponse(cragError || new Error('Draft crag not found'), 'Failed to validate publish destination')
  }

  if (!crag.slug) {
    return NextResponse.json({ error: 'The selected crag is missing its canonical slug' }, { status: 409 })
  }

  if (crag.country_code) return null

  const repairLatitude = hasValidDraftCoordinate(crag.latitude, crag.longitude) ? crag.latitude : latitude
  const repairLongitude = hasValidDraftCoordinate(crag.latitude, crag.longitude) ? crag.longitude : longitude
  if (!hasValidDraftCoordinate(repairLatitude, repairLongitude)) {
    return NextResponse.json({ error: 'Could not resolve the selected crag country before publishing' }, { status: 409 })
  }

  const resolvedCountry = await resolveCountryFromCoordinates(supabase, repairLatitude, repairLongitude)
  if (!resolvedCountry.countryCode) {
    return NextResponse.json({ error: 'Could not resolve the selected crag country before publishing' }, { status: 409 })
  }

  const repairClient = getAdminClientWithAudit('repair draft crag country before publish')
  const { data: repairedCountryCode, error: repairError } = await repairClient
    .rpc('repair_submission_draft_crag_country', {
      p_draft_id: draftId,
      p_user_id: userId,
      p_crag_id: cragId,
      p_latitude: repairLatitude,
      p_longitude: repairLongitude,
      p_country_code: resolvedCountry.countryCode,
      p_country_name: resolvedCountry.countryName,
      p_region_name: resolvedCountry.regionName,
    })

  if (repairError) {
    return createErrorResponse(repairError, 'Failed to repair publish destination')
  }
  if (!repairedCountryCode) {
    return NextResponse.json({ error: 'Could not resolve the selected crag country before publishing' }, { status: 409 })
  }

  return null
}

interface DraftRouteRef {
  id: string
  draft_image_id: string
}

interface PublishedCragIdentity {
  id: string
  countryCode: string
  slug: string
}

type DraftImagePublishRow = Pick<DraftImageRow, 'id' | 'display_order' | 'latitude' | 'longitude' | 'route_data'> & { linked_image_id: string | null }

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

function resolveDraftImageLocationMode(metadata: unknown, image: DraftImagePublishRow): 'shared' | 'custom' {
  const safeMetadata = normalizeJsonRecord(metadata)
  const images = normalizeJsonRecord(safeMetadata?.images)
  const imageMetadata = normalizeJsonRecord(images?.[image.id])
  const locationMode = imageMetadata?.locationMode

  if (locationMode === 'shared' || locationMode === 'custom') return locationMode
  return hasValidDraftCoordinate(image.latitude, image.longitude) ? 'custom' : 'shared'
}

function formatDraftImageLabel(image: DraftImagePublishRow): string {
  return `Image ${image.display_order + 1}`
}

async function buildPublishedResponse(input: {
  supabase: DraftSupabaseClient
  result: PromoteResult
  userId: string
  runPostPublishEffects?: boolean
}) {
  const { supabase, result, userId, runPostPublishEffects = true } = input
  const defaultImageId = result.default_image_id || result.image_id
  if (!defaultImageId) {
    return NextResponse.json({ error: 'Failed to resolve published image' }, { status: 500 })
  }

  const { data: canonicalImage, error: canonicalImageError } = await supabase
    .from('images')
    .select('id, crag_id, crags:crag_id(name, country_code, slug), route_lines(id, climb_id, sequence_order, created_at)')
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
  const climbIds = normalizeStringArray(result.climb_ids)
  const notificationClimbs = runPostPublishEffects && climbIds.length > 0
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

  if (runPostPublishEffects && notificationClimbs.length > 0 && cragId) {
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
  const imageIds = normalizeStringArray(result.image_ids)

  if (runPostPublishEffects) {
    await recordSubmissionPublishedEvent(defaultImageId).catch((contributorScoreError) => {
      reportError(contributorScoreError, { message: 'Contributor score publish event error' })
    })
  }

  const publishedCrag: PublishedCragIdentity | null = cragId
    ? { id: cragId, countryCode: crag.country_code, slug: crag.slug }
    : null

  if (publishedCrag) {
    revalidatePublicCragPaths({
      cragId: publishedCrag.id,
      countryCode: publishedCrag.countryCode,
      slug: publishedCrag.slug,
    })
  }

  return NextResponse.json({
    success: true,
    status: result.status || 'submitted',
    published: {
      defaultImageId,
      imageId: result.image_id,
      imageIds: imageIds.length > 0 ? imageIds : [defaultImageId],
      climbIds,
      routeLineIds: normalizeStringArray(result.route_line_ids),
      publishedAt: result.published_at || null,
      canonicalPath,
      countryCode: crag.country_code.toLowerCase(),
      cragSlug: crag.slug,
      defaultRouteId: defaultRoute?.id || null,
    },
  })
}

export async function promoteDraftToSubmission(input: {
  supabase: DraftSupabaseClient
  request: Request
  draftId: string
  userId: string
}) {
  const { supabase, draftId, userId } = input
  const { data: hasConsent, error: consentError } = await supabase.rpc('has_valid_open_data_consent')
  if (consentError) return createErrorResponse(consentError, 'Failed to validate contribution terms')
  if (hasConsent !== true) {
    return NextResponse.json({
      code: OPEN_DATA_CONSENT_REQUIRED,
      error: 'Accept the Open Data Contributor Terms to publish.',
    }, { status: 428 })
  }

  const { data: draft, error: draftError } = await supabase
    .from('submission_drafts')
    .select('id, user_id, crag_id, status, metadata, updated_at')
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
    .select('id, display_order, latitude, longitude, route_data, linked_image_id')
    .eq('draft_id', draftId)

  if (draftImagesError) {
    return createErrorResponse(draftImagesError, 'Failed to validate draft images before publish')
  }

  const draftImageRows = (draftImages || []) as DraftImagePublishRow[]

  if (draft.status === 'submitted') {
    const draftLocation = resolveEffectiveDraftPublishLocation(draft.metadata, draftImageRows)
    const canonicalCragError = await ensureCanonicalCrag({
      supabase,
      cragId: draft.crag_id,
      draftId,
      userId,
      latitude: draftLocation.latitude,
      longitude: draftLocation.longitude,
    })
    if (canonicalCragError) return canonicalCragError

    const publishedResult = resolvePublishedResult(draft.metadata)
    if (!publishedResult) {
      return NextResponse.json({ error: 'Failed to recover published draft destination' }, { status: 500 })
    }

    return buildPublishedResponse({ supabase, result: publishedResult, userId, runPostPublishEffects: false })
  }

  const linkedImageIds = Array.from(new Set(draftImageRows.flatMap((image) => image.linked_image_id ? [image.linked_image_id] : [])))
  const { data: linkedImages, error: linkedImagesError } = linkedImageIds.length > 0
    ? await supabase
      .from('images')
      .select('id, processing_status, moderation_status, visibility, status')
      .in('id', linkedImageIds)
    : { data: [], error: null }

  if (linkedImagesError) return createErrorResponse(linkedImagesError, 'Failed to validate draft media before publish')
  if (draftImageRows.some((image) => !image.linked_image_id) || (linkedImages || []).length !== linkedImageIds.length || !(linkedImages || []).every(isMediaPubliclyDeliverable)) {
    return NextResponse.json(MEDIA_NOT_READY_RESPONSE, { status: 409 })
  }
  const draftLocation = extractDraftLocation(draft.metadata)
  const effectiveDraftLocation = resolveEffectiveDraftPublishLocation(draft.metadata, draftImageRows)
  const hasValidLocation = hasValidDraftCoordinate(effectiveDraftLocation.latitude, effectiveDraftLocation.longitude)

  if (!hasValidLocation) {
    return NextResponse.json({ error: 'Add climb location before publishing this draft' }, { status: 400 })
  }

  const canonicalCragError = await ensureCanonicalCrag({
    supabase,
    cragId: draft.crag_id,
    draftId,
    userId,
    latitude: effectiveDraftLocation.latitude,
    longitude: effectiveDraftLocation.longitude,
  })
  if (canonicalCragError) return canonicalCragError

  if (!hasValidDraftCoordinate(draftLocation.latitude, draftLocation.longitude)) {
    const draftMetadata = draft.metadata && typeof draft.metadata === 'object' && !Array.isArray(draft.metadata)
      ? draft.metadata as Record<string, unknown>
      : {}
    const existingSubmission = draftMetadata.submission && typeof draftMetadata.submission === 'object' && !Array.isArray(draftMetadata.submission)
      ? draftMetadata.submission as Record<string, unknown>
      : {}

    const { data: repairedDraft, error: repairDraftLocationError } = await supabase
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
      .eq('status', 'draft')
      .eq('updated_at', draft.updated_at)
      .select('id')
      .maybeSingle()

    if (repairDraftLocationError) {
      return createErrorResponse(repairDraftLocationError, 'Failed to repair draft location before publish')
    }
    if (!repairedDraft) {
      return NextResponse.json({ error: 'The draft changed before it could be published' }, { status: 409 })
    }
  }

  const imagesMissingLocation = draftImageRows.filter((image) => {
    const locationMode = resolveDraftImageLocationMode(draft.metadata, image)
    if (locationMode === 'custom') return !hasValidDraftCoordinate(image.latitude, image.longitude)
    return !hasValidLocation
  })

  if (imagesMissingLocation.length > 0) {
    const labels = imagesMissingLocation
      .sort((a, b) => a.display_order - b.display_order)
      .map(formatDraftImageLabel)
      .join(', ')

    return NextResponse.json({ error: `Add location for ${labels} before publishing this draft` }, { status: 400 })
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

      try {
        const { error } = await supabase.rpc('sync_submission_draft_routes', {
          p_draft_id: draftId,
          p_draft_image_id: imageId,
          p_routes: completedRoutes,
        })

        if (error) {
          reportError(error, {
            message: 'Failed to repair draft routes before publish',
            level: 'warning',
            extra: { draftId, imageId, routeCount: completedRoutes.length },
          })
        }
      } catch (error) {
        reportError(error, {
          message: 'Failed to repair draft routes before publish',
          level: 'warning',
          extra: { draftId, imageId, routeCount: completedRoutes.length },
        })
      }
    }

    const { data: repairedDraftRoutes, error: repairedDraftRoutesError } = await supabase
      .from('submission_draft_routes')
      .select('id, draft_image_id')
      .eq('draft_id', draftId)

    if (repairedDraftRoutesError) {
      reportError(repairedDraftRoutesError, {
        message: 'Failed to validate repaired draft routes before publish',
        level: 'warning',
        extra: { draftId },
      })
    } else {
      routeRows = (repairedDraftRoutes || []) as DraftRouteRef[]
      imagesMissingRoutes = resolveImagesMissingRoutes(routeRows)
    }
  }

  const { data, error } = await supabase.rpc('promote_draft_to_submission', { p_draft_id: draftId })
  if (error) {
    if (error.details === 'open_data_consent_required') {
      return NextResponse.json({ code: OPEN_DATA_CONSENT_REQUIRED, error: 'Accept the Open Data Contributor Terms to publish.' }, { status: 428 })
    }
    if (isMediaNotReadyError(error)) {
      return NextResponse.json(MEDIA_NOT_READY_RESPONSE, { status: 409 })
    }
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

  return buildPublishedResponse({ supabase, result, userId })
}
