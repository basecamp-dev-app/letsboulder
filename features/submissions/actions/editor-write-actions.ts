'use server'
import { z } from 'zod'

import { recordAcceptedWikiContribution } from '@/features/community/public'
import { getActionAuth } from '@/lib/actions/action-auth'
import { fail, type ActionResult } from '@/lib/actions/action-result'
import { validateActionInput } from '@/lib/actions/validate-action-input'
import { getServerClient } from '@/lib/supabase-server'
import { assertDraftReadAccess, normalizeDraftRoutePayload } from '@/features/submissions/server/drafts/draft-route-helpers'
import { buildDraftConflictResult, mergeDraftMetadata, revalidateSubmissionImagePaths } from '@/features/submissions/actions/editor-write-action-helpers'
import {
  type DraftPatchImage,
} from '@/features/submissions/server/drafts/draft-route-shared'
import { FACE_DIRECTIONS } from '@/features/submissions/lib/submission-types'
import type { Json } from '@/types/database'
import { isOpenDataConsentError, OPEN_DATA_CONSENT_REQUIRED } from '@/features/legal/public'

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

const draftPatchSchema = z.object({
  draftId: z.string().trim().min(1, 'Draft ID is required'),
  body: z.object({
    images: z.array(z.object({
      id: z.string().trim().min(1),
      display_order: z.number().int(),
      route_data: z.record(z.string(), z.unknown()),
    })).min(1, 'images must be a non-empty array of {id, display_order, route_data}'),
    expected_updated_at: z.string().trim().min(1, 'expected_updated_at is required and must be a valid ISO timestamp'),
    metadata: z.record(z.string(), z.unknown()).optional(),
    cragId: z.string().trim().min(1).nullable().optional(),
  }),
})

const syncDraftRoutesSchema = z.object({
  draftId: z.string().trim().min(1, 'Draft ID is required'),
  draftImageId: z.string().trim().min(1, 'draftImageId is required'),
  routes: z.unknown(),
})

const routePointSchema = z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) })
const atomicPublishedEditSchema = z.object({
  imageId: z.uuid(),
  clientMutationId: z.uuid(),
  operations: z.object({
    baseRevision: z.number().int().nonnegative(),
    imageMetadata: z.object({
      latitude: z.number().min(-90).max(90).nullable(),
      longitude: z.number().min(-180).max(180).nullable(),
      faceDirections: z.array(z.enum(FACE_DIRECTIONS)),
      locationMode: z.enum(['shared', 'custom']),
    }).optional(),
    createRoutes: z.array(z.object({
      clientRouteId: z.uuid(),
      name: z.string().trim().min(1).max(200),
      grade: z.string().trim().min(1),
      climbType: z.enum(['sport', 'boulder', 'trad', 'deep-water-solo']),
      description: z.string().trim().max(500).nullable(),
      points: z.array(routePointSchema).min(2),
      sequenceOrder: z.number().int().nonnegative(),
      imageWidth: z.number().int().positive(),
      imageHeight: z.number().int().positive(),
    })).default([]),
    updateRoutes: z.array(z.object({
      routeLineId: z.uuid(),
      name: z.string().trim().min(1).max(200),
      description: z.string().trim().max(500).nullable(),
      points: z.array(routePointSchema).min(2),
      sequenceOrder: z.number().int().nonnegative(),
    })).default([]),
    gradeVotes: z.array(z.object({
      routeLineId: z.uuid(),
      grade: z.string().trim().min(1),
    })).default([]),
  }),
})

export interface PublishedRouteIdMapping {
  clientRouteId: string
  routeLineId: string
  climbId: string
}

export interface AtomicPublishedEditResult {
  imageId: string
  clientMutationId: string
  commitId: string | null
  revision: number
  routeMappings: PublishedRouteIdMapping[]
  historyIds: string[]
  createdCount: number
  updatedCount: number
  votesUpdated: number
  replayed: boolean
}

function readAtomicPublishedEditResult(value: unknown): AtomicPublishedEditResult | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const result = value as Record<string, unknown>
  if (typeof result.imageId !== 'string' || typeof result.clientMutationId !== 'string'
    || typeof result.revision !== 'number' || !Array.isArray(result.routeMappings)
    || !Array.isArray(result.historyIds)) return null
  if (result.commitId !== null && typeof result.commitId !== 'string' && result.commitId !== undefined) return null
  const routeMappings = result.routeMappings.filter((mapping): mapping is PublishedRouteIdMapping => {
    if (!mapping || typeof mapping !== 'object' || Array.isArray(mapping)) return false
    const row = mapping as Record<string, unknown>
    return typeof row.clientRouteId === 'string' && typeof row.routeLineId === 'string'
      && typeof row.climbId === 'string'
  })
  const historyIds = result.historyIds.filter((id): id is string => typeof id === 'string')
  if (routeMappings.length !== result.routeMappings.length || historyIds.length !== result.historyIds.length) return null
  return {
    imageId: result.imageId,
    clientMutationId: result.clientMutationId,
    commitId: typeof result.commitId === 'string' ? result.commitId : null,
    revision: result.revision,
    routeMappings,
    historyIds,
    createdCount: typeof result.createdCount === 'number' ? result.createdCount : 0,
    updatedCount: typeof result.updatedCount === 'number' ? result.updatedCount : 0,
    votesUpdated: typeof result.votesUpdated === 'number' ? result.votesUpdated : 0,
    replayed: result.replayed === true,
  }
}

export async function patchSubmissionDraftAction(draftId: string, body: DraftPatchBody): Promise<ActionResult<{ draft: DraftPatchResult | { updated_at: string } }>> {
  const validation = validateActionInput(draftPatchSchema, { draftId, body })
  if (!validation.success) return fail<{ draft: DraftPatchResult | { updated_at: string } }>(validation.result.error || 'Invalid request data', validation.result.status || 400)

  const auth = await getActionAuth()
  if (!auth.success) return { success: false, error: auth.error, status: auth.status }
  if (!auth.data?.userId) return { success: false, error: 'Authentication required', status: 401 }

  const images = normalizePatchImages(validation.data.body.images)
  if (!images) {
    return { success: false, error: 'images must be a non-empty array of {id, display_order, route_data}', status: 400 }
  }

  const expectedUpdatedAtRaw = validation.data.body.expected_updated_at
  const expectedUpdatedAtDate = expectedUpdatedAtRaw ? new Date(expectedUpdatedAtRaw) : null
  if (!expectedUpdatedAtDate || Number.isNaN(expectedUpdatedAtDate.getTime())) {
    return { success: false, error: 'expected_updated_at is required and must be a valid ISO timestamp', status: 400 }
  }

  const supabase = await getServerClient()
  const { data: draft, error: draftError } = await supabase
    .from('submission_drafts')
    .select('id, user_id, status, updated_at, last_edited_by')
    .eq('id', validation.data.draftId)
    .maybeSingle()

  if (draftError || !draft) return { success: false, error: 'Draft not found', status: 404 }

  const isOwner = draft.user_id === auth.data.userId
  if (!isOwner) {
    const { data: collaboratorAccess, error: collaboratorError } = await supabase
        .from('submission_draft_collaborators')
        .select('draft_id')
        .eq('draft_id', validation.data.draftId)
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
    const payload = await buildDraftConflictResult(supabase, draft.updated_at, draft.last_edited_by)
    return { success: false, error: payload.error || 'Draft conflict', status: 409, data: payload }
  }

  const { data: patchResultRaw, error: patchError } = await supabase.rpc('patch_submission_draft_images_atomic', {
    p_draft_id: validation.data.draftId,
    p_images: images,
    p_expected_updated_at: expectedUpdatedAtRaw,
  })

  if (patchError) {
    if (patchError.message === 'Draft conflict') {
      const { data: currentDraft } = await supabase
        .from('submission_drafts')
        .select('updated_at, last_edited_by')
        .eq('id', validation.data.draftId)
        .maybeSingle()

      const payload = await buildDraftConflictResult(
        supabase,
        currentDraft?.updated_at || expectedUpdatedAtRaw,
        currentDraft?.last_edited_by || null
      )
      return { success: false, error: payload.error || 'Draft conflict', status: 409, data: payload }
    }

    return { success: false, error: 'Failed to patch submission draft', status: 500 }
  }

  const patchResult = (patchResultRaw || null) as DraftPatchResult | null
  const metadataPatch = validation.data.body.metadata ?? null
  const nextCragId = validation.data.body.cragId

  if (metadataPatch || nextCragId !== undefined) {
      const { data: existingDraft, error: existingDraftError } = await supabase
        .from('submission_drafts')
        .select('metadata')
        .eq('id', validation.data.draftId)
        .single()

    if (existingDraftError) return { success: false, error: 'Failed to read submission draft metadata', status: 500 }

    const existingMetadata = existingDraft?.metadata && typeof existingDraft.metadata === 'object' && !Array.isArray(existingDraft.metadata)
      ? existingDraft.metadata as Record<string, unknown>
      : {}

    const nextMetadata = metadataPatch ? mergeDraftMetadata(existingMetadata, metadataPatch) : existingMetadata

    const updatePayload: { metadata?: Record<string, unknown>; crag_id?: string | null; updated_at: string; last_edited_by: string } = {
      updated_at: new Date().toISOString(),
      last_edited_by: auth.data.userId,
    }
    if (metadataPatch) updatePayload.metadata = nextMetadata
    if (nextCragId !== undefined) updatePayload.crag_id = nextCragId

    const { data: updatedDraft, error: updateDraftError } = await supabase
      .from('submission_drafts')
      .update(updatePayload)
      .eq('id', validation.data.draftId)
      .eq('status', 'draft')
      .select('updated_at')
      .maybeSingle()

    if (updateDraftError) return { success: false, error: 'Failed to update submission draft metadata', status: 500 }

    return {
      success: true,
      data: {
          draft: {
          ...(patchResult || { draft_id: validation.data.draftId, updated_at: updatePayload.updated_at, updated_count: 0, images: [] }),
          updated_at: updatedDraft?.updated_at || patchResult?.updated_at || updatePayload.updated_at,
        },
      },
    }
  }

  return { success: true, data: { draft: patchResult || { draft_id: validation.data.draftId, updated_at: draft.updated_at, updated_count: 0, images: [] } } }
}

export async function syncSubmissionDraftRoutesAction(draftId: string, draftImageId: string, routes: unknown): Promise<ActionResult> {
  const validation = validateActionInput(syncDraftRoutesSchema, { draftId, draftImageId, routes })
  if (!validation.success) return validation.result

  const auth = await getActionAuth()
  if (!auth.success) return { success: false, error: auth.error, status: auth.status }
  if (!auth.data?.userId) return { success: false, error: 'Authentication required', status: 401 }

  const normalizedRoutes = normalizeDraftRoutePayload(validation.data.routes)
  if (!normalizedRoutes) return { success: false, error: 'routes must be an array', status: 400 }

  const supabase = await getServerClient()
  const access = await assertDraftReadAccess(supabase, validation.data.draftId, auth.data.userId)
  if (access.error) return { success: false, error: 'Forbidden', status: access.error.status }

  const { error } = await supabase.rpc('sync_submission_draft_routes', {
    p_draft_id: validation.data.draftId,
    p_draft_image_id: validation.data.draftImageId,
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

  if (error) {
    if (isOpenDataConsentError(error)) return { success: false, error: OPEN_DATA_CONSENT_REQUIRED, status: 428 }
    return { success: false, error: 'Failed to sync draft routes', status: 500 }
  }
  return { success: true }
}

export async function applyPublishedSubmissionEditAction(
  imageId: string,
  clientMutationId: string,
  operations: unknown
): Promise<ActionResult<AtomicPublishedEditResult>> {
  const validation = validateActionInput(atomicPublishedEditSchema, { imageId, clientMutationId, operations })
  if (!validation.success) {
    return fail<AtomicPublishedEditResult>(validation.result.error || 'Invalid published edit', validation.result.status || 400)
  }

  const auth = await getActionAuth()
  if (!auth.success) return { success: false, error: auth.error, status: auth.status }
  if (!auth.data?.userId) return { success: false, error: 'Authentication required', status: 401 }

  const supabase = await getServerClient()
  const { data, error } = await supabase.rpc('apply_published_submission_edit', {
    p_image_id: validation.data.imageId,
    p_client_mutation_id: validation.data.clientMutationId,
    p_operations: validation.data.operations as Json,
  })

  if (error) {
    if (isOpenDataConsentError(error)) return { success: false, error: OPEN_DATA_CONSENT_REQUIRED, status: 428 }
    if (error.details === 'wiki_revision_conflict' || error.code === '40001') {
      return { success: false, error: 'This submission changed while you were editing. Reload it before saving again.', status: 409 }
    }
    if (error.details === 'mutation_id_conflict') {
      return { success: false, error: 'This save request changed after it was submitted. Try saving again.', status: 409 }
    }
    if (error.code === '42501') return { success: false, error: error.message, status: 403 }
    if (error.code === '22023') return { success: false, error: error.message, status: 400 }
    return { success: false, error: 'Failed to save submission changes', status: 500 }
  }

  const result = readAtomicPublishedEditResult(data)
  if (!result) return { success: false, error: 'Invalid response from published edit transaction', status: 500 }

  for (const historyId of result.historyIds) {
    await recordAcceptedWikiContribution(historyId)
  }
  await revalidateSubmissionImagePaths(supabase, validation.data.imageId)

  return { success: true, data: result }
}

export async function deletePublishedSubmissionRouteAction(imageId: string, body: unknown): Promise<ActionResult> {
  void imageId
  void body
  return { success: false, error: 'Community wiki editing is additive only. Deleting published routes is disabled.', status: 403 }
}

export async function reorderSubmissionFacesAction(imageId: string, body: unknown): Promise<ActionResult<{ updatedCount: number }>> {
  void imageId
  void body
  return { success: false, error: 'Community wiki editing is additive only. Reordering published faces is disabled.', status: 403 }
}
