import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createErrorResponse } from '@/lib/errors'
import { parseWithSchema } from '@/lib/api-validation'
import {
  buildDraftConflictResponse,
  resolveDisplayName,
  type ProfileRow,
} from '@/features/submissions/server/drafts/draft-route-shared'

interface DraftPatchImage {
  id: string
  display_order: number
  route_data: unknown
}

interface DraftPatchResult {
  draft_id: string
  updated_at: string
  updated_count: number
  images: Array<Record<string, unknown>>
}

const draftPatchImageSchema = z.object({
  id: z.string().min(1),
  display_order: z.number().int().min(0),
  route_data: z.unknown().optional(),
})

const draftPatchSchema = z.object({
  images: z.array(draftPatchImageSchema).min(1, 'images must be a non-empty array of {id, display_order, route_data}'),
  expected_updated_at: z.string().min(1, 'expected_updated_at is required and must be a valid ISO timestamp'),
  metadata: z.record(z.string(), z.unknown()).optional(),
  cragId: z.string().nullable().optional(),
})

export async function patchDraft(
  id: string,
  request: NextRequest,
  middlewareResult: { supabase: ReturnType<typeof import('@supabase/ssr').createServerClient>; userId: string }
) {
  if (!id) {
    return NextResponse.json({ error: 'Draft ID is required' }, { status: 400 })
  }

  const { supabase, userId } = middlewareResult

  try {
    const parsedBody = parseWithSchema(draftPatchSchema, await request.json().catch(() => null))
    if (!parsedBody.success) return parsedBody.response

    const body = parsedBody.data
    const images: DraftPatchImage[] = body.images.map((image) => ({
      id: image.id,
      display_order: image.display_order,
      route_data: image.route_data ?? {},
    }))

    const expectedUpdatedAtRaw = body.expected_updated_at.trim()
    const expectedUpdatedAtDate = expectedUpdatedAtRaw ? new Date(expectedUpdatedAtRaw) : null
    if (!expectedUpdatedAtDate || Number.isNaN(expectedUpdatedAtDate.getTime())) {
      return NextResponse.json({ error: 'expected_updated_at is required and must be a valid ISO timestamp' }, { status: 400 })
    }

    const { data: draft, error: draftError } = await supabase
      .from('submission_drafts')
      .select('id, user_id, status, updated_at, last_edited_by')
      .eq('id', id)
      .maybeSingle()

    if (draftError || !draft) {
      return NextResponse.json({ error: 'Draft not found' }, { status: 404 })
    }

    const isOwner = draft.user_id === userId
    if (!isOwner) {
      const { data: collaboratorAccess, error: collaboratorError } = await supabase
        .from('submission_draft_collaborators')
        .select('draft_id')
        .eq('draft_id', id)
        .eq('user_id', userId)
        .maybeSingle()

      if (collaboratorError || !collaboratorAccess) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    }

    if (draft.status !== 'draft') {
      return NextResponse.json({ error: 'Only draft submissions can be edited' }, { status: 400 })
    }

    const expectedUpdatedAt = expectedUpdatedAtRaw
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

      return buildDraftConflictResponse({
        updatedAt: draft.updated_at,
        lastEditedBy: draft.last_edited_by,
        lastUpdatedByDisplayName,
      })
    }

    const { data: patchResultRaw, error: patchError } = await supabase.rpc('patch_submission_draft_images_atomic', {
      p_draft_id: id,
      p_images: images,
      p_expected_updated_at: expectedUpdatedAt,
    })

    if (patchError) {
      if (patchError.message === 'Draft conflict') {
        const { data: currentDraft } = await supabase
          .from('submission_drafts')
          .select('updated_at, last_edited_by')
          .eq('id', id)
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

        const fallbackUpdatedAt = currentDraft?.updated_at || expectedUpdatedAt
        return buildDraftConflictResponse({
          updatedAt: fallbackUpdatedAt,
          lastEditedBy: currentDraft?.last_edited_by || null,
          lastUpdatedByDisplayName,
        })
      }
      return createErrorResponse(patchError, 'Failed to patch submission draft')
    }

    const patchResult = (patchResultRaw || null) as DraftPatchResult | null

    const metadataPatch = body?.metadata && typeof body.metadata === 'object' && !Array.isArray(body.metadata)
      ? body.metadata
      : null
    const nextCragId = typeof body?.cragId === 'string'
      ? body.cragId
      : body?.cragId === null
        ? null
        : undefined

    if (metadataPatch || nextCragId !== undefined) {
      const { data: existingDraft, error: existingDraftError } = await supabase
        .from('submission_drafts')
        .select('metadata')
        .eq('id', id)
        .single()

      if (existingDraftError) {
        return createErrorResponse(existingDraftError, 'Failed to read submission draft metadata')
      }

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
        last_edited_by: userId,
      }
      if (metadataPatch) {
        updatePayload.metadata = nextMetadata
      }
      if (nextCragId !== undefined) {
        updatePayload.crag_id = nextCragId
      }

      const { data: updatedDraft, error: updateDraftError } = await supabase
        .from('submission_drafts')
        .update(updatePayload)
        .eq('id', id)
        .eq('status', 'draft')
        .select('updated_at')
        .maybeSingle()

      if (updateDraftError) {
        return createErrorResponse(updateDraftError, 'Failed to update submission draft metadata')
      }

      return NextResponse.json({
        success: true,
        draft: {
          ...(patchResult || {}),
          updated_at: updatedDraft?.updated_at || patchResult?.updated_at || updatePayload.updated_at,
        },
      })
    }

    return NextResponse.json({ success: true, draft: patchResult })
  } catch (error) {
    return createErrorResponse(error, 'Failed to patch submission draft')
  }
}
