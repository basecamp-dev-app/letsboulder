import { cleanupDraftStorageObjects } from '@/lib/media/draft-storage'
import { getRpcErrorDetail, isRecord, parseStorageCleanupRows } from '@/lib/media/deletion-rpc'
import { getAdminClientWithAudit } from '@/lib/supabase-admin'
import { sanitizeError } from '@/lib/errors'
import { normalizeDraftRouteBatchPayload, normalizeDraftRoutePayload } from '@/features/submissions/server/drafts/draft-route-helpers'
import { resolveDisplayName, type DraftConflictResponse, type ProfileRow } from '@/features/submissions/server/drafts/draft-route-shared'
import { isOpenDataConsentError } from '@/features/legal/public-server'
import type { Json } from '@/types/database'

type DraftSupabaseClient = ReturnType<typeof import('@supabase/ssr').createServerClient>

export interface DraftPatchImage {
  id: string
  display_order: number
  route_data: Record<string, unknown>
}

export interface DraftPatchInput {
  draftId: string
  images: DraftPatchImage[]
  expectedUpdatedAt: string
  metadata?: Record<string, unknown>
  cragId?: string | null
}

export interface DraftAtomicSaveInput {
  draftId: string
  images: DraftPatchImage[]
  routeSets: Array<{ draftImageId: string; routes: unknown }>
  expectedUpdatedAt: string
  metadata: Record<string, unknown>
  cragId: string | null
}

export interface DraftPatchResult {
  draft_id: string
  updated_at: string
  updated_count: number
  images: Array<Record<string, unknown>>
}

type DraftWriteFailure = {
  kind: 'not_found' | 'forbidden' | 'not_editable' | 'invalid' | 'failed'
  error?: string
  errorId?: string
}

export type DraftPatchServiceResult =
  | { kind: 'success'; draft: DraftPatchResult | null; updatedAt?: string }
  | { kind: 'conflict'; conflict: DraftConflictResponse }
  | { kind: 'consent_required' }
  | DraftWriteFailure

export type DraftDeleteServiceResult =
  | { kind: 'success' }
  | { kind: 'not_found' | 'forbidden' | 'not_editable' | 'conflict' | 'failed'; error?: string; errorId?: string }

export type DraftRouteSyncServiceResult =
  | { kind: 'success' }
  | { kind: 'not_found' | 'forbidden' | 'consent_required' | 'failed' }

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function hasValidAtomicRoutePoints(routeSets: DraftAtomicSaveInput['routeSets']): boolean {
  return routeSets.every((routeSet) => Array.isArray(routeSet.routes)
    && routeSet.routes.every((routeValue) => {
      const route = asRecord(routeValue)
      return Array.isArray(route.points) && route.points.every((pointValue) => {
        const point = asRecord(pointValue)
        return typeof point.x === 'number' && Number.isFinite(point.x)
          && typeof point.y === 'number' && Number.isFinite(point.y)
      })
    }))
}

export function mergeDraftMetadata(existingMetadata: Record<string, unknown>, metadataPatch: Record<string, unknown>) {
  const existingSubmission = asRecord(existingMetadata.submission)
  const patchSubmission = asRecord(metadataPatch.submission)
  return {
    ...existingMetadata,
    ...metadataPatch,
    submission: {
      ...existingSubmission,
      ...patchSubmission,
      location: { ...asRecord(existingSubmission.location), ...asRecord(patchSubmission.location) },
    },
  }
}

async function buildConflict(supabase: DraftSupabaseClient, updatedAt: string, lastEditedBy: string | null): Promise<DraftConflictResponse> {
  let lastUpdatedByDisplayName: string | null = null
  if (lastEditedBy) {
    const { data: profile } = await supabase.from('profiles').select('id, username, display_name').eq('id', lastEditedBy).maybeSingle()
    lastUpdatedByDisplayName = resolveDisplayName((profile || null) as ProfileRow | null)
  }
  return {
    code: 'draft_conflict',
    message: 'This draft was updated by another collaborator. Reload to continue editing.',
    current_updated_at: updatedAt,
    current_data: { updated_at: updatedAt, last_updated_by: lastEditedBy, last_updated_by_display_name: lastUpdatedByDisplayName },
  }
}

async function assertDraftWriteAccess(supabase: DraftSupabaseClient, draftId: string, userId: string) {
  const { data: draft, error } = await supabase.from('submission_drafts').select('id, user_id, status, updated_at, last_edited_by').eq('id', draftId).maybeSingle()
  if (error || !draft) return { kind: 'not_found' as const }
  if (draft.user_id === userId) return { kind: 'success' as const, draft }
  const { data: collaborator, error: collaboratorError } = await supabase.from('submission_draft_collaborators').select('draft_id').eq('draft_id', draftId).eq('user_id', userId).maybeSingle()
  return collaboratorError || !collaborator ? { kind: 'forbidden' as const } : { kind: 'success' as const, draft }
}

export async function patchSubmissionDraft(input: DraftPatchInput & { supabase: DraftSupabaseClient; userId: string }): Promise<DraftPatchServiceResult> {
  try {
    const access = await assertDraftWriteAccess(input.supabase, input.draftId, input.userId)
    if (access.kind !== 'success') return access
    if (access.draft.status !== 'draft') return { kind: 'not_editable' }
    if (new Date(access.draft.updated_at).getTime() !== new Date(input.expectedUpdatedAt).getTime()) {
      return { kind: 'conflict', conflict: await buildConflict(input.supabase, access.draft.updated_at, access.draft.last_edited_by) }
    }
    const { data, error } = await input.supabase.rpc('patch_submission_draft_images_atomic', {
      p_draft_id: input.draftId, p_images: input.images, p_expected_updated_at: input.expectedUpdatedAt,
    })
    if (error) {
      if (error.message === 'Draft conflict') {
        const { data: current } = await input.supabase.from('submission_drafts').select('updated_at, last_edited_by').eq('id', input.draftId).maybeSingle()
        return { kind: 'conflict', conflict: await buildConflict(input.supabase, current?.updated_at || input.expectedUpdatedAt, current?.last_edited_by || null) }
      }
      return { kind: 'failed', ...sanitizeError(error, 'Failed to patch submission draft') }
    }
    const draft = (data || null) as DraftPatchResult | null
    if (!input.metadata && input.cragId === undefined) return { kind: 'success', draft }
    const { data: existing, error: readError } = await input.supabase.from('submission_drafts').select('metadata').eq('id', input.draftId).single()
    if (readError) return { kind: 'failed', ...sanitizeError(readError, 'Failed to read submission draft metadata') }
    const updatedAt = new Date().toISOString()
    const updatePayload: { metadata?: Record<string, unknown>; crag_id?: string | null; updated_at: string; last_edited_by: string } = { updated_at: updatedAt, last_edited_by: input.userId }
    if (input.metadata) updatePayload.metadata = mergeDraftMetadata(asRecord(existing?.metadata), input.metadata)
    if (input.cragId !== undefined) updatePayload.crag_id = input.cragId
    const { data: updated, error: updateError } = await input.supabase.from('submission_drafts').update(updatePayload).eq('id', input.draftId).eq('status', 'draft').select('updated_at').maybeSingle()
    if (updateError) return { kind: 'failed', ...sanitizeError(updateError, 'Failed to update submission draft metadata') }
    return { kind: 'success', draft, updatedAt: updated?.updated_at || draft?.updated_at || updatedAt }
  } catch (error) {
    return { kind: 'failed', ...sanitizeError(error, 'Failed to patch submission draft') }
  }
}

export async function saveSubmissionDraftAtomic(input: DraftAtomicSaveInput & { supabase: DraftSupabaseClient }): Promise<DraftPatchServiceResult> {
  try {
    if (!hasValidAtomicRoutePoints(input.routeSets)) return { kind: 'invalid', error: 'Invalid draft route points' }
    const routeSets = normalizeDraftRouteBatchPayload(input.routeSets)
    if (!routeSets) return { kind: 'invalid', error: 'Invalid draft route payload' }
    const imagePayload: Json = input.images.map((image) => ({
      id: image.id,
      display_order: image.display_order,
      route_data: image.route_data as Json,
    }))
    const routeSetPayload: Json = routeSets.map((routeSet) => ({
      draftImageId: routeSet.draftImageId,
      routes: routeSet.routes.map((route) => ({
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
    }))

    const { data, error } = await input.supabase.rpc('save_submission_draft_atomic', {
      p_draft_id: input.draftId,
      p_expected_updated_at: input.expectedUpdatedAt,
      p_images: imagePayload,
      p_route_sets: routeSetPayload,
      p_metadata: input.metadata as Json,
      ...(input.cragId ? { p_crag_id: input.cragId } : {}),
    })
    if (error) {
      const detail = getRpcErrorDetail(error)
      if (detail === 'not_found') return { kind: 'not_found' }
      if (detail === 'permission_denied') return { kind: 'forbidden' }
      if (detail === 'draft_not_editable') return { kind: 'not_editable' }
      if (detail === 'invalid_payload') return { kind: 'invalid', error: error.message }
      if (detail === 'open_data_consent_required' || isOpenDataConsentError(error)) return { kind: 'consent_required' }
      if (detail === 'draft_conflict') {
        const { data: current } = await input.supabase.from('submission_drafts').select('updated_at, last_edited_by').eq('id', input.draftId).maybeSingle()
        return { kind: 'conflict', conflict: await buildConflict(input.supabase, current?.updated_at || input.expectedUpdatedAt, current?.last_edited_by || null) }
      }
      return { kind: 'failed', ...sanitizeError(error, 'Failed to save submission draft') }
    }

    return { kind: 'success', draft: (data || null) as DraftPatchResult | null }
  } catch (error) {
    return { kind: 'failed', ...sanitizeError(error, 'Failed to save submission draft') }
  }
}

export async function deleteSubmissionDraft(input: { supabase: DraftSupabaseClient; draftId: string; cleanupAuditReason: string }): Promise<DraftDeleteServiceResult> {
  try {
    const { data, error } = await input.supabase.rpc('delete_submission_draft_atomic', { p_draft_id: input.draftId })
    if (error) {
      const detail = getRpcErrorDetail(error)
      if (detail === 'not_found') return { kind: 'not_found' }
      if (detail === 'permission_denied') return { kind: 'forbidden' }
      if (detail === 'draft_not_editable') return { kind: 'not_editable' }
      if (detail === 'draft_conflict') return { kind: 'conflict' }
      return { kind: 'failed', ...sanitizeError(error, 'Failed to delete submission draft') }
    }
    if (!isRecord(data)) return { kind: 'failed', ...sanitizeError(new Error('Invalid draft deletion response'), 'Failed to delete submission draft') }
    const cleanupRows = parseStorageCleanupRows(data.cleanup)
    if (cleanupRows.length > 0) await cleanupDraftStorageObjects(getAdminClientWithAudit(input.cleanupAuditReason), cleanupRows)
    return { kind: 'success' }
  } catch (error) {
    return { kind: 'failed', ...sanitizeError(error, 'Failed to delete submission draft') }
  }
}

export async function syncSubmissionDraftRoutes(input: { supabase: DraftSupabaseClient; userId: string; draftId: string; batches: Array<{ draftImageId: string; routes: unknown }> }): Promise<DraftRouteSyncServiceResult> {
  const access = await assertDraftWriteAccess(input.supabase, input.draftId, input.userId)
  if (access.kind !== 'success') return access
  for (const batch of input.batches) {
    const routes = normalizeDraftRoutePayload(batch.routes)
    if (!routes) return { kind: 'failed' }
    const { error } = await input.supabase.rpc('sync_submission_draft_routes', {
      p_draft_id: input.draftId, p_draft_image_id: batch.draftImageId, p_routes: routes,
    })
    if (error) return isOpenDataConsentError(error) ? { kind: 'consent_required' } : { kind: 'failed' }
  }
  return { kind: 'success' }
}
