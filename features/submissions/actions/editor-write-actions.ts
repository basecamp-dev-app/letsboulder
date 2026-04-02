'use server'

import { revalidatePath } from 'next/cache'
import { getActionAuth } from '@/lib/actions/action-auth'
import { type ActionResult } from '@/lib/actions/action-result'
import { getAdminClient, getServerClient } from '@/lib/supabase-server'
import { assertDraftReadAccess, normalizeDraftRoutePayload } from '@/features/submissions/server/drafts/draft-route-helpers'
import {
  buildDraftConflictResponse,
  resolveDisplayName,
  type DraftPatchImage,
  type ProfileRow,
} from '@/features/submissions/server/drafts/draft-route-shared'
import { createSubmissionRoutes } from '@/features/submissions/server/submissions/create-submission-routes'
import { deleteSubmissionRoute } from '@/features/submissions/server/submissions/delete-submission-route'
import { updateSubmissionRoutes } from '@/features/submissions/server/submissions/update-submission-routes'
import { type SubmissionRouteMutationDeps } from '@/features/submissions/server/submissions/route-line-shared'
import { FACE_DIRECTIONS, type FaceDirection } from '@/features/submissions/lib/submission-types'

interface DraftPatchBody {
  images: DraftPatchImage[]
  expected_updated_at?: string
  metadata?: Record<string, unknown>
  cragId?: string | null
}

interface DraftPatchResult {
  draft_id: string
  updated_at: string
  updated_count: number
  images: Array<Record<string, unknown>>
}

function normalizePatchImages(value: unknown): DraftPatchImage[] | null {
  if (!Array.isArray(value) || value.length === 0) return null

  const normalized = value.map((item) => {
    if (!item || typeof item !== 'object') return null
    const candidate = item as { id?: unknown; display_order?: unknown; route_data?: unknown }
    if (typeof candidate.id !== 'string') return null
    if (typeof candidate.display_order !== 'number' || !Number.isInteger(candidate.display_order)) return null
    if (!candidate.route_data || typeof candidate.route_data !== 'object' || Array.isArray(candidate.route_data)) return null
    return {
      id: candidate.id,
      display_order: candidate.display_order,
      route_data: candidate.route_data as Record<string, unknown>,
    }
  })

  return normalized.every((item) => item !== null) ? normalized : null
}

function normalizeImageMetadataPayload(value: unknown) {
  if (!value || typeof value !== 'object') return null
  const candidate = value as {
    latitude?: unknown
    longitude?: unknown
    faceDirections?: unknown
    locationMode?: unknown
  }

  const latitude = candidate.latitude
  const longitude = candidate.longitude
  const faceDirections = candidate.faceDirections
  const locationMode = candidate.locationMode

  if (!(latitude === null || typeof latitude === 'number')) return null
  if (!(longitude === null || typeof longitude === 'number')) return null
  if (!Array.isArray(faceDirections)) return null
  if (!(locationMode === undefined || locationMode === 'shared' || locationMode === 'custom')) return null
  if (typeof latitude === 'number' && (!Number.isFinite(latitude) || latitude < -90 || latitude > 90)) return null
  if (typeof longitude === 'number' && (!Number.isFinite(longitude) || longitude < -180 || longitude > 180)) return null

  const normalizedDirections = Array.from(
    new Set(
      faceDirections
        .map((item) => (typeof item === 'string' ? item.toUpperCase() : ''))
        .filter((item): item is FaceDirection => FACE_DIRECTIONS.includes(item as FaceDirection))
    )
  )

  if (normalizedDirections.length !== faceDirections.length) return null

  return {
    latitude: latitude as number | null,
    longitude: longitude as number | null,
    faceDirections: normalizedDirections,
    locationMode: locationMode === 'shared' ? 'shared' : locationMode === 'custom' ? 'custom' : undefined,
  }
}

function normalizeFacesPayload(value: unknown): { imageIds: string[] } | null {
  if (!value || typeof value !== 'object') return null
  const candidate = value as { imageIds?: unknown }
  if (!Array.isArray(candidate.imageIds)) return null
  const imageIds = candidate.imageIds.filter((item): item is string => typeof item === 'string' && item.length > 0)
  if (imageIds.length !== candidate.imageIds.length || imageIds.length === 0) return null
  return { imageIds }
}

export async function patchSubmissionDraftAction(draftId: string, body: DraftPatchBody): Promise<ActionResult<{ draft: DraftPatchResult | { updated_at: string } }>> {
  const auth = await getActionAuth()
  if (!auth.success) return { success: false, error: auth.error, status: auth.status }
  if (!auth.data?.userId) return { success: false, error: 'Authentication required', status: 401 }
  if (!draftId) return { success: false, error: 'Draft ID is required', status: 400 }

  const images = normalizePatchImages(body?.images)
  if (!images) {
    return { success: false, error: 'images must be a non-empty array of {id, display_order, route_data}', status: 400 }
  }

  const expectedUpdatedAtRaw = typeof body?.expected_updated_at === 'string' ? body.expected_updated_at.trim() : ''
  const expectedUpdatedAtDate = expectedUpdatedAtRaw ? new Date(expectedUpdatedAtRaw) : null
  if (!expectedUpdatedAtDate || Number.isNaN(expectedUpdatedAtDate.getTime())) {
    return { success: false, error: 'expected_updated_at is required and must be a valid ISO timestamp', status: 400 }
  }

  const supabase = await getServerClient()
  const { data: draft, error: draftError } = await supabase
    .from('submission_drafts')
    .select('id, user_id, status, updated_at, last_edited_by')
    .eq('id', draftId)
    .maybeSingle()

  if (draftError || !draft) return { success: false, error: 'Draft not found', status: 404 }

  const isOwner = draft.user_id === auth.data.userId
  if (!isOwner) {
    const { data: collaboratorAccess, error: collaboratorError } = await supabase
      .from('submission_draft_collaborators')
      .select('draft_id')
      .eq('draft_id', draftId)
      .eq('user_id', auth.data.userId)
      .maybeSingle()

    if (collaboratorError || !collaboratorAccess) {
      return { success: false, error: 'Forbidden', status: 403 }
    }
  }

  if (draft.status !== 'draft') return { success: false, error: 'Only draft submissions can be edited', status: 400 }

  const expectedUpdatedAtMs = expectedUpdatedAtDate.getTime()
  const currentUpdatedAtMs = new Date(draft.updated_at).getTime()
  if (!Number.isFinite(currentUpdatedAtMs) || currentUpdatedAtMs !== expectedUpdatedAtMs) {
    let lastUpdatedByDisplayName: string | null = null
    if (typeof draft.last_edited_by === 'string' && draft.last_edited_by) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('id, username, display_name')
        .eq('id', draft.last_edited_by)
        .maybeSingle()
      lastUpdatedByDisplayName = resolveDisplayName((profile || null) as ProfileRow | null)
    }

    const response = buildDraftConflictResponse({
      updatedAt: draft.updated_at,
      lastEditedBy: draft.last_edited_by,
      lastUpdatedByDisplayName,
    })
    const payload = await response.json()
    return { success: false, error: payload.error || 'Draft conflict', status: 409, data: payload }
  }

  const { data: patchResultRaw, error: patchError } = await supabase.rpc('patch_submission_draft_images_atomic', {
    p_draft_id: draftId,
    p_images: images,
    p_expected_updated_at: expectedUpdatedAtRaw,
  })

  if (patchError) {
    if (patchError.message === 'Draft conflict') {
      const { data: currentDraft } = await supabase
        .from('submission_drafts')
        .select('updated_at, last_edited_by')
        .eq('id', draftId)
        .maybeSingle()

      let lastUpdatedByDisplayName: string | null = null
      if (typeof currentDraft?.last_edited_by === 'string' && currentDraft.last_edited_by) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('id, username, display_name')
          .eq('id', currentDraft.last_edited_by)
          .maybeSingle()
        lastUpdatedByDisplayName = resolveDisplayName((profile || null) as ProfileRow | null)
      }

      const response = buildDraftConflictResponse({
        updatedAt: currentDraft?.updated_at || expectedUpdatedAtRaw,
        lastEditedBy: currentDraft?.last_edited_by || null,
        lastUpdatedByDisplayName,
      })
      const payload = await response.json()
      return { success: false, error: payload.error || 'Draft conflict', status: 409, data: payload }
    }

    return { success: false, error: 'Failed to patch submission draft', status: 500 }
  }

  const patchResult = (patchResultRaw || null) as DraftPatchResult | null
  const metadataPatch = body?.metadata && typeof body.metadata === 'object' && !Array.isArray(body.metadata) ? body.metadata : null
  const nextCragId = typeof body?.cragId === 'string' ? body.cragId : body?.cragId === null ? null : undefined

  if (metadataPatch || nextCragId !== undefined) {
    const { data: existingDraft, error: existingDraftError } = await supabase
      .from('submission_drafts')
      .select('metadata')
      .eq('id', draftId)
      .single()

    if (existingDraftError) return { success: false, error: 'Failed to read submission draft metadata', status: 500 }

    const existingMetadata = existingDraft?.metadata && typeof existingDraft.metadata === 'object' && !Array.isArray(existingDraft.metadata)
      ? existingDraft.metadata as Record<string, unknown>
      : {}

    const nextMetadata = metadataPatch
      ? {
          ...existingMetadata,
          ...metadataPatch,
          submission: {
            ...((existingMetadata.submission && typeof existingMetadata.submission === 'object' && !Array.isArray(existingMetadata.submission))
              ? existingMetadata.submission as Record<string, unknown>
              : {}),
            ...((metadataPatch.submission && typeof metadataPatch.submission === 'object' && !Array.isArray(metadataPatch.submission))
              ? metadataPatch.submission as Record<string, unknown>
              : {}),
            location: {
              ...((((existingMetadata.submission && typeof existingMetadata.submission === 'object' && !Array.isArray(existingMetadata.submission)
                ? (existingMetadata.submission as Record<string, unknown>).location
                : null) && typeof (existingMetadata.submission as Record<string, unknown>).location === 'object' && !Array.isArray((existingMetadata.submission as Record<string, unknown>).location))
                ? (existingMetadata.submission as Record<string, unknown>).location as Record<string, unknown>
                : {})),
              ...((((metadataPatch.submission && typeof metadataPatch.submission === 'object' && !Array.isArray(metadataPatch.submission)
                ? (metadataPatch.submission as Record<string, unknown>).location
                : null) && typeof (metadataPatch.submission as Record<string, unknown>).location === 'object' && !Array.isArray((metadataPatch.submission as Record<string, unknown>).location))
                ? (metadataPatch.submission as Record<string, unknown>).location as Record<string, unknown>
                : {})),
            },
          },
        }
      : existingMetadata

    const updatePayload: { metadata?: Record<string, unknown>; crag_id?: string | null; updated_at: string; last_edited_by: string } = {
      updated_at: new Date().toISOString(),
      last_edited_by: auth.data.userId,
    }
    if (metadataPatch) updatePayload.metadata = nextMetadata
    if (nextCragId !== undefined) updatePayload.crag_id = nextCragId

    const { data: updatedDraft, error: updateDraftError } = await supabase
      .from('submission_drafts')
      .update(updatePayload)
      .eq('id', draftId)
      .eq('status', 'draft')
      .select('updated_at')
      .maybeSingle()

    if (updateDraftError) return { success: false, error: 'Failed to update submission draft metadata', status: 500 }

    return {
      success: true,
      data: {
        draft: {
          ...(patchResult || { draft_id: draftId, updated_at: updatePayload.updated_at, updated_count: 0, images: [] }),
          updated_at: updatedDraft?.updated_at || patchResult?.updated_at || updatePayload.updated_at,
        },
      },
    }
  }

  return { success: true, data: { draft: patchResult || { draft_id: draftId, updated_at: draft.updated_at, updated_count: 0, images: [] } } }
}

export async function syncSubmissionDraftRoutesAction(draftId: string, draftImageId: string, routes: unknown): Promise<ActionResult> {
  const auth = await getActionAuth()
  if (!auth.success) return { success: false, error: auth.error, status: auth.status }
  if (!auth.data?.userId) return { success: false, error: 'Authentication required', status: 401 }
  if (!draftId) return { success: false, error: 'Draft ID is required', status: 400 }
  if (!draftImageId) return { success: false, error: 'draftImageId is required', status: 400 }

  const normalizedRoutes = normalizeDraftRoutePayload(routes)
  if (!normalizedRoutes) return { success: false, error: 'routes must be an array', status: 400 }

  const supabase = await getServerClient()
  const access = await assertDraftReadAccess(supabase, draftId, auth.data.userId)
  if (access.error) return { success: false, error: 'Forbidden', status: access.error.status }

  const { error } = await supabase.rpc('sync_submission_draft_routes', {
    p_draft_id: draftId,
    p_draft_image_id: draftImageId,
    p_routes: normalizedRoutes.map((route) => ({
      id: route.id,
      name: route.name,
      grade: route.grade,
      description: route.description,
      climbType: route.climbType,
      points: route.points,
      sequenceOrder: route.sequenceOrder,
      imageWidth: route.imageWidth,
      imageHeight: route.imageHeight,
    })),
  })

  if (error) return { success: false, error: 'Failed to sync draft routes', status: 500 }
  return { success: true }
}

export async function createPublishedSubmissionRoutesAction(imageId: string, body: unknown): Promise<ActionResult> {
  const auth = await getActionAuth()
  if (!auth.success) return { success: false, error: auth.error, status: auth.status }
  if (!auth.data?.userId) return { success: false, error: 'Authentication required', status: 401 }
  if (!imageId) return { success: false, error: 'Image ID is required', status: 400 }

  const supabase = await getServerClient()
  const supabaseAdmin = getAdminClient()
  const deps: SubmissionRouteMutationDeps = { supabase, supabaseAdmin, userId: auth.data.userId, imageId }
  const response = await createSubmissionRoutes(deps, body)
  const payload = await response.json().catch(() => ({} as { error?: string }))
  if (!response.ok) return { success: false, error: payload.error || 'Create routes error', status: response.status }
  return { success: true, data: payload }
}

export async function updatePublishedSubmissionRoutesAction(imageId: string, body: unknown): Promise<ActionResult> {
  const auth = await getActionAuth()
  if (!auth.success) return { success: false, error: auth.error, status: auth.status }
  if (!auth.data?.userId) return { success: false, error: 'Authentication required', status: 401 }
  if (!imageId) return { success: false, error: 'Image ID is required', status: 400 }

  const supabase = await getServerClient()
  const deps: SubmissionRouteMutationDeps = { supabase, supabaseAdmin: null, userId: auth.data.userId, imageId }
  const response = await updateSubmissionRoutes(deps, body)
  const payload = await response.json().catch(() => ({} as { error?: string }))
  if (!response.ok) return { success: false, error: payload.error || 'Update submitted routes error', status: response.status }
  return { success: true, data: payload }
}

export async function deletePublishedSubmissionRouteAction(imageId: string, body: unknown): Promise<ActionResult> {
  const auth = await getActionAuth()
  if (!auth.success) return { success: false, error: auth.error, status: auth.status }
  if (!auth.data?.userId) return { success: false, error: 'Authentication required', status: 401 }
  if (!imageId) return { success: false, error: 'Image ID is required', status: 400 }

  const supabase = await getServerClient()
  const supabaseAdmin = getAdminClient()
  const deps: SubmissionRouteMutationDeps = { supabase, supabaseAdmin, userId: auth.data.userId, imageId }
  const response = await deleteSubmissionRoute(deps, body)
  const payload = await response.json().catch(() => ({} as { error?: string }))
  if (!response.ok) return { success: false, error: payload.error || 'Delete route error', status: response.status, data: payload }
  return { success: true, data: payload }
}

export async function updateSubmissionImageMetadataAction(imageId: string, body: unknown): Promise<ActionResult<{ metadata: Record<string, unknown> }>> {
  const auth = await getActionAuth()
  if (!auth.success) return { success: false, error: auth.error, status: auth.status }
  if (!auth.data?.userId) return { success: false, error: 'Authentication required', status: 401 }
  if (!imageId) return { success: false, error: 'Image ID is required', status: 400 }

  const payload = normalizeImageMetadataPayload(body)
  if (!payload) return { success: false, error: 'Invalid payload', status: 400 }

  const supabase = await getServerClient()
  const { data: result, error: rpcError } = await supabase.rpc('update_submission_image_metadata', {
    p_image_id: imageId,
    p_latitude: payload.latitude,
    p_longitude: payload.longitude,
    p_face_directions: payload.faceDirections,
    p_location_mode: payload.locationMode ?? null,
  })

  if (rpcError) {
    const message = (rpcError.message || '').toLowerCase()
    if (message.includes('permission')) return { success: false, error: 'You do not have permission to edit this submission', status: 403 }
    if (message.includes('latitude') || message.includes('longitude') || message.includes('face direction')) {
      return { success: false, error: rpcError.message, status: 400 }
    }
    return { success: false, error: 'Update submission image metadata error', status: 500 }
  }

  const { data: directLink } = await supabase.from('crag_images').select('source_image_id').eq('linked_image_id', imageId).maybeSingle()
  const sourceImageId = typeof directLink?.source_image_id === 'string' && directLink.source_image_id ? directLink.source_image_id : imageId
  const relatedImageIds = new Set<string>([sourceImageId])
  const { data: linkedImages } = await supabase.from('crag_images').select('linked_image_id').eq('source_image_id', sourceImageId)

  for (const link of linkedImages || []) {
    if (typeof link.linked_image_id === 'string' && link.linked_image_id) {
      relatedImageIds.add(link.linked_image_id)
    }
  }

  if (payload.locationMode === 'shared' && relatedImageIds.size > 1) {
    const { error: syncCoordsError } = await supabase
      .from('images')
      .update({ latitude: null, longitude: null, location_mode: 'shared', last_edited_by: auth.data.userId })
      .in('id', [...relatedImageIds])

    if (syncCoordsError) {
      console.error('Failed to sync linked image coordinates:', syncCoordsError)
    }
  }

  revalidatePath('/')
  const { data: image } = await supabase.from('images').select('crag_id').eq('id', imageId).single()
  if (image?.crag_id) {
    const { data: cragData } = await supabase.from('crags').select('slug, country_code').eq('id', image.crag_id).single()
    if (cragData?.slug && cragData?.country_code) {
      revalidatePath(`/${cragData.country_code.toLowerCase()}/${cragData.slug}`)
    }
  }

  return {
    success: true,
    data: {
      metadata: result && typeof result === 'object'
        ? result as Record<string, unknown>
        : {
            latitude: payload.locationMode === 'shared' ? null : payload.latitude,
            longitude: payload.locationMode === 'shared' ? null : payload.longitude,
            location_mode: payload.locationMode ?? 'custom',
            face_directions: payload.faceDirections,
          },
    },
  }
}

export async function reorderSubmissionFacesAction(imageId: string, body: unknown): Promise<ActionResult<{ updatedCount: number }>> {
  const auth = await getActionAuth()
  if (!auth.success) return { success: false, error: auth.error, status: auth.status }
  if (!auth.data?.userId) return { success: false, error: 'Authentication required', status: 401 }
  if (!imageId) return { success: false, error: 'Image ID is required', status: 400 }

  const payload = normalizeFacesPayload(body)
  if (!payload) return { success: false, error: 'Invalid payload', status: 400 }

  const supabase = await getServerClient()
  const { data: image, error: imageError } = await supabase
    .from('images')
    .select('submission_id, crag_id')
    .eq('id', imageId)
    .maybeSingle()

  if (imageError) return { success: false, error: 'Reorder submission faces error', status: 500 }
  if (!image?.submission_id) return { success: false, error: 'Submission not found', status: 404 }

  const { data: result, error: reorderError } = await supabase.rpc('update_submission_image_order', {
    p_submission_id: image.submission_id,
    p_image_ids: payload.imageIds,
  })

  if (reorderError) {
    const message = (reorderError.message || '').toLowerCase()
    if (message.includes('permission')) return { success: false, error: 'You do not have permission to edit this submission', status: 403 }
    return { success: false, error: 'Reorder submission faces error', status: 500 }
  }

  revalidatePath('/')
  if (image.crag_id) {
    const { data: cragData } = await supabase.from('crags').select('slug, country_code').eq('id', image.crag_id).single()
    if (cragData?.slug && cragData?.country_code) {
      revalidatePath(`/${cragData.country_code.toLowerCase()}/${cragData.slug}`)
    }
  }

  return { success: true, data: { updatedCount: typeof result === 'number' ? result : payload.imageIds.length } }
}
