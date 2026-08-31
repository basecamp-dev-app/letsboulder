import { reportError, sanitizeError } from '@/lib/errors'
import { notifyNewSubmission } from '@/lib/discord'
import {
  isMediaAssociationError,
  isMediaNotReadyError,
  isMediaPubliclyDeliverable,
  MEDIA_ASSOCIATION_BROKEN_RESPONSE,
  MEDIA_NOT_READY_RESPONSE,
  MEDIA_PROCESSING_FAILED_RESPONSE,
} from '@/lib/media/readiness'
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

export interface DraftPublishSuccess {
  status: string
  publication: {
    state: 'public' | 'pending_crag_review'
    cragId: string | null
  }
  published: {
    defaultImageId: string
    imageId: string | undefined
    imageIds: string[]
    climbIds: string[]
    routeLineIds: string[]
    publishedAt: string | null
    canonicalPath: string | null
    countryCode: string
    cragSlug: string
    defaultRouteId: string | null
  }
}

export type DraftPublishResult =
  | { kind: 'success'; value: DraftPublishSuccess }
  | { kind: 'failure'; status: number; payload: Record<string, unknown> }

function publishFailure(status: number, payload: Record<string, unknown>): DraftPublishResult {
  return { kind: 'failure', status, payload }
}

function publishInternalError(error: unknown, message: string): DraftPublishResult {
  return publishFailure(500, { ...sanitizeError(error, message) })
}

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
}): Promise<DraftPublishResult | null> {
  const { supabase, cragId, draftId, userId, latitude, longitude } = input
  if (!cragId) {
    return publishFailure(400, { error: 'Select a crag before publishing this draft' })
  }

  const { data: crag, error: cragError } = await supabase
    .from('crags')
    .select('id, country_code, slug, latitude, longitude, deleted_at, superseded_by')
    .eq('id', cragId)
    .maybeSingle()

  if (cragError) {
    return publishInternalError(cragError, 'Failed to validate publish destination')
  }

  if (!crag || crag.deleted_at || crag.superseded_by) {
    const { error: clearError } = await supabase
      .from('submission_drafts')
      .update({ crag_id: null })
      .eq('id', draftId)
      .eq('user_id', userId)
      .eq('status', 'draft')

    if (clearError) {
      return publishInternalError(clearError, 'Failed to clear unavailable publish destination')
    }
    return publishFailure(409, {
      code: 'crag_unavailable',
      error: 'The selected crag is no longer available. Choose a crag before publishing.',
    })
  }

  if (!crag.slug) {
    return publishFailure(409, { error: 'The selected crag is missing its canonical slug' })
  }

  if (crag.country_code) return null

  const repairLatitude = hasValidDraftCoordinate(crag.latitude, crag.longitude) ? crag.latitude : latitude
  const repairLongitude = hasValidDraftCoordinate(crag.latitude, crag.longitude) ? crag.longitude : longitude
  if (!hasValidDraftCoordinate(repairLatitude, repairLongitude)) {
    return publishFailure(409, { error: 'Could not resolve the selected crag country before publishing' })
  }

  const resolvedCountry = await resolveCountryFromCoordinates(supabase, repairLatitude, repairLongitude)
  if (!resolvedCountry.countryCode) {
    return publishFailure(409, { error: 'Could not resolve the selected crag country before publishing' })
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
      ...(resolvedCountry.countryName ? { p_country_name: resolvedCountry.countryName } : {}),
      ...(resolvedCountry.regionName ? { p_region_name: resolvedCountry.regionName } : {}),
    })

  if (repairError) {
    return publishInternalError(repairError, 'Failed to repair publish destination')
  }
  if (!repairedCountryCode) {
    return publishFailure(409, { error: 'Could not resolve the selected crag country before publishing' })
  }

  return null
}

interface PublishedCragIdentity {
  id: string
  countryCode: string
  slug: string
}

type DraftImagePublishRow = Pick<DraftImageRow, 'id' | 'display_order' | 'latitude' | 'longitude' | 'storage_bucket' | 'storage_path'> & { linked_image_id: string | null }
type LinkedImagePublishRow = Pick<
  import('@/types/database').Database['public']['Tables']['images']['Row'],
  'id' | 'created_by' | 'original_bucket' | 'original_key' | 'storage_bucket' | 'storage_path'
  | 'processing_status' | 'moderation_status' | 'visibility' | 'status'
>

function brokenMediaAssociation(draftId: string, reason: string): DraftPublishResult {
  reportError(new Error('Draft media association is broken'), {
    message: 'Draft publish media association preflight failed',
    tags: { diagnostic_code: MEDIA_ASSOCIATION_BROKEN_RESPONSE.code },
    extra: { draftId, reason },
  })
  return publishFailure(409, MEDIA_ASSOCIATION_BROKEN_RESPONSE)
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
}): Promise<DraftPublishResult> {
  const { supabase, result, userId, runPostPublishEffects = true } = input
  const defaultImageId = result.default_image_id || result.image_id
  if (!defaultImageId) {
    return publishFailure(500, { error: 'Failed to resolve published image' })
  }

  const { data: canonicalImage, error: canonicalImageError } = await supabase
    .from('images')
    .select('id, crag_id, crags:crag_id(name, country_code, slug, publication_status), route_lines(id, climb_id, sequence_order, created_at)')
    .eq('id', defaultImageId)
    .maybeSingle()

  if (canonicalImageError || !canonicalImage) {
    return publishInternalError(canonicalImageError || new Error('Failed to resolve canonical image path after publish'), 'Failed to resolve publish destination')
  }

  const crag = Array.isArray(canonicalImage.crags) ? canonicalImage.crags[0] : canonicalImage.crags
  if (!crag?.country_code || !crag?.slug) {
    return publishFailure(500, { error: 'Failed to resolve canonical crag path after publish' })
  }

  const cragId = typeof canonicalImage.crag_id === 'string' ? canonicalImage.crag_id : null
  const climbIds = normalizeStringArray(result.climb_ids)
  const isPublic = crag.publication_status === 'published'
  const notificationClimbs = runPostPublishEffects && isPublic && climbIds.length > 0
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

  const canonicalPath = isPublic
    ? `/${crag.country_code.toLowerCase()}/${crag.slug}/i/${defaultImageId}`
    : null
  const imageIds = normalizeStringArray(result.image_ids)

  if (runPostPublishEffects && isPublic) {
    await recordSubmissionPublishedEvent(defaultImageId).catch((contributorScoreError) => {
      reportError(contributorScoreError, { message: 'Contributor score publish event error' })
    })
  }

  const publishedCrag: PublishedCragIdentity | null = cragId
    ? { id: cragId, countryCode: crag.country_code, slug: crag.slug }
    : null

  if (publishedCrag && isPublic) {
    revalidatePublicCragPaths({
      cragId: publishedCrag.id,
      countryCode: publishedCrag.countryCode,
      slug: publishedCrag.slug,
    })
  }

  return { kind: 'success', value: {
    status: result.status || 'submitted',
    publication: {
      state: isPublic ? 'public' : 'pending_crag_review',
      cragId,
    },
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
  } }
}

export async function promoteDraftToSubmission(input: {
  supabase: DraftSupabaseClient
  draftId: string
  userId: string
}): Promise<DraftPublishResult> {
  const { supabase, draftId, userId } = input
  const { data: hasConsent, error: consentError } = await supabase.rpc('has_valid_open_data_consent')
  if (consentError) return publishInternalError(consentError, 'Failed to validate contribution terms')
  if (hasConsent !== true) {
    return publishFailure(428, {
      code: OPEN_DATA_CONSENT_REQUIRED,
      error: 'Accept the Open Data Contributor Terms to publish.',
    })
  }

  const { data: draft, error: draftError } = await supabase
    .from('submission_drafts')
    .select('id, user_id, crag_id, status, metadata, updated_at, draft_kind')
    .eq('id', draftId)
    .maybeSingle()

  if (draftError) {
    return publishInternalError(draftError, 'Failed to validate draft before publish')
  }

  if (!draft) {
    return publishFailure(404, { error: 'Draft not found' })
  }

  if (draft.user_id !== userId) {
    return publishFailure(403, { error: 'Only the draft owner can publish this draft' })
  }

  if (draft.draft_kind === 'topo_replacement') {
    const { data: replacement, error: replacementError } = await supabase
      .from('topo_replacements')
      .select('id')
      .eq('draft_id', draftId)
      .maybeSingle()
    if (replacementError) return publishInternalError(replacementError, 'Failed to load topo replacement')
    if (!replacement) return publishFailure(409, { error: 'Topo replacement workflow is missing' })

    const { data, error } = await supabase.rpc('publish_topo_replacement', {
      p_replacement_id: replacement.id,
    })
    if (error) {
      if (isPermissionDeniedError(error)) return publishFailure(403, { error: 'Crag management access required' })
      if (error.code === '22023' || error.code === 'P0002' || error.code === '23514') {
        return publishFailure(409, { error: error.message })
      }
      return publishInternalError(error, 'Failed to publish topo replacement')
    }
    const result = (Array.isArray(data) ? data[0] : data) as PromoteResult | null
    if (!result?.success || !result.image_id) {
      return publishFailure(500, { error: 'Failed to publish topo replacement' })
    }
    return buildPublishedResponse({ supabase, result, userId, runPostPublishEffects: false })
  }

  const { data: draftImages, error: draftImagesError } = await supabase
    .from('submission_draft_images')
    .select('id, display_order, latitude, longitude, storage_bucket, storage_path, linked_image_id')
    .eq('draft_id', draftId)

  if (draftImagesError) {
    return publishInternalError(draftImagesError, 'Failed to validate draft images before publish')
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
      return publishFailure(500, { error: 'Failed to recover published draft destination' })
    }

    return buildPublishedResponse({ supabase, result: publishedResult, userId, runPostPublishEffects: false })
  }

  const linkedImageIds = Array.from(new Set(draftImageRows.flatMap((image) => image.linked_image_id ? [image.linked_image_id] : [])))
  const { data: linkedImages, error: linkedImagesError } = linkedImageIds.length > 0
    ? await supabase
      .from('images')
      .select('id, created_by, original_bucket, original_key, storage_bucket, storage_path, processing_status, moderation_status, visibility, status')
      .in('id', linkedImageIds)
    : { data: [], error: null }

  if (linkedImagesError) return publishInternalError(linkedImagesError, 'Failed to validate draft media before publish')
  const linkedImageRows = (linkedImages || []) as LinkedImagePublishRow[]

  if (draftImageRows.some((image) => !image.linked_image_id)) {
    return brokenMediaAssociation(draftId, 'missing_linked_image_id')
  }
  if (linkedImageRows.length !== linkedImageIds.length) {
    return brokenMediaAssociation(draftId, 'missing_authoritative_image')
  }

  const linkedImageById = new Map(linkedImageRows.map((image) => [image.id, image]))
  const hasLocatorMismatch = draftImageRows.some((draftImage) => {
    const linkedImage = draftImage.linked_image_id
      ? linkedImageById.get(draftImage.linked_image_id)
      : null
    if (!linkedImage) return true
    return !(
      (linkedImage.original_bucket === draftImage.storage_bucket
        && linkedImage.original_key === draftImage.storage_path)
      || (linkedImage.storage_bucket === draftImage.storage_bucket
        && linkedImage.storage_path === draftImage.storage_path)
    )
  })
  if (hasLocatorMismatch) {
    return brokenMediaAssociation(draftId, 'locator_mismatch')
  }

  if (linkedImageRows.some((image) => image.processing_status === 'failed')) {
    return publishFailure(409, MEDIA_PROCESSING_FAILED_RESPONSE)
  }
  if (linkedImageRows.some((image) => ['pending', 'queued', 'processing'].includes(image.processing_status || ''))) {
    return publishFailure(409, MEDIA_NOT_READY_RESPONSE)
  }
  if (!linkedImageRows.every(isMediaPubliclyDeliverable)) {
    return brokenMediaAssociation(draftId, 'non_deliverable_terminal_state')
  }
  const draftLocation = extractDraftLocation(draft.metadata)
  const effectiveDraftLocation = resolveEffectiveDraftPublishLocation(draft.metadata, draftImageRows)
  const hasValidLocation = hasValidDraftCoordinate(effectiveDraftLocation.latitude, effectiveDraftLocation.longitude)

  if (!hasValidLocation) {
    return publishFailure(400, { error: 'Add climb location before publishing this draft' })
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
      return publishInternalError(repairDraftLocationError, 'Failed to repair draft location before publish')
    }
    if (!repairedDraft) {
      return publishFailure(409, { error: 'The draft changed before it could be published' })
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

    return publishFailure(400, { error: `Add location for ${labels} before publishing this draft` })
  }

  const { data, error } = await supabase.rpc('promote_draft_to_submission', { p_draft_id: draftId })
  if (error) {
    if (error.details === 'open_data_consent_required') {
      return publishFailure(428, { code: OPEN_DATA_CONSENT_REQUIRED, error: 'Accept the Open Data Contributor Terms to publish.' })
    }
    if (isMediaAssociationError(error)) {
      return brokenMediaAssociation(draftId, 'promotion_rpc_association_guard')
    }
    if (isMediaNotReadyError(error)) {
      return publishFailure(409, MEDIA_NOT_READY_RESPONSE)
    }
    if (typeof error.message === 'string' && error.message.includes('Draft location is required before publishing')) {
      return publishFailure(400, { error: 'Add climb location before publishing this draft' })
    }
    if (typeof error.message === 'string' && error.message.includes('Content cannot be associated with a deleted crag')) {
      await supabase
        .from('submission_drafts')
        .update({ crag_id: null })
        .eq('id', draftId)
        .eq('user_id', userId)
        .eq('status', 'draft')
      return publishFailure(409, {
        code: 'crag_unavailable',
        error: 'The selected crag is no longer available. Choose a crag before publishing.',
      })
    }
    if (isPermissionDeniedError(error)) {
      return publishFailure(403, { error: 'Forbidden' })
    }
    return publishInternalError(error, 'Failed to publish draft')
  }

  const result = (Array.isArray(data) ? data[0] : data) as PromoteResult | null
  if (!result?.success || !result.image_id) {
    return publishFailure(500, { error: 'Failed to publish draft' })
  }

  return buildPublishedResponse({ supabase, result, userId })
}
