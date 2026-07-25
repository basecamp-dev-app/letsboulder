import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAdminClientWithAudit } from '@/lib/supabase-admin'
import { withApiMiddleware } from '@/lib/csrf-server'
import { createErrorResponse } from '@/lib/errors'
import { cleanupDraftStorageObjects } from '@/lib/media/draft-storage'
import { getRpcErrorDetail, getRpcErrorHint, isRecord, parseStorageCleanupRows } from '@/lib/media/deletion-rpc'
import { parseWithSchema } from '@/lib/api-validation'

const deleteDraftImageParamsSchema = z.object({
  id: z.string().min(1, 'id is required'),
  imageId: z.string().min(1, 'imageId is required'),
})

const deleteDraftImageQuerySchema = z.object({
  expected_updated_at: z.string().trim().min(1, 'expected_updated_at is required and must be a valid ISO timestamp'),
})

interface DraftConflictResponse {
  code: 'draft_conflict'
  message: string
  current_updated_at: string
  current_data: {
    updated_at: string
    last_updated_by: string | null
    last_updated_by_display_name: string | null
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; imageId: string }> }
) {
  const middlewareResult = await withApiMiddleware(request, {
    unauthorizedMessage: 'Authentication required',
    rateLimitKey: 'authenticatedWrite',
  })
  if (!middlewareResult.ok) return middlewareResult.response

  const rawParams = await params
  const paramsValidation = parseWithSchema(deleteDraftImageParamsSchema, rawParams)
  if (!paramsValidation.success) return paramsValidation.response

  const { id, imageId } = paramsValidation.data

  const searchParams = Object.fromEntries(new URL(request.url).searchParams)
  const queryValidation = parseWithSchema(deleteDraftImageQuerySchema, searchParams)
  if (!queryValidation.success) return queryValidation.response

  const { expected_updated_at } = queryValidation.data
  const expectedUpdatedAtMs = new Date(expected_updated_at).getTime()
  if (!Number.isFinite(expectedUpdatedAtMs)) {
    return NextResponse.json({
      error: 'Invalid request data',
      fieldErrors: {
        expected_updated_at: ['Invalid ISO datetime'],
      },
    }, { status: 400 })
  }

  const { supabase } = middlewareResult

  try {
    const { data, error } = await supabase.rpc('delete_submission_draft_image_atomic', {
      p_draft_id: id,
      p_draft_image_id: imageId,
      p_expected_updated_at: expected_updated_at,
    })

    if (error) {
      const detail = getRpcErrorDetail(error)
      if (detail === 'not_found') return NextResponse.json({ error: 'Draft image not found' }, { status: 404 })
      if (detail === 'permission_denied') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      if (detail === 'draft_not_editable') {
        return NextResponse.json({ error: 'Only draft submissions can be edited' }, { status: 409 })
      }
      if (detail === 'draft_conflict' && error.message.toLowerCase().includes('at least one')) {
        return NextResponse.json({ error: 'A draft must keep at least one face image' }, { status: 400 })
      }
      if (detail === 'draft_conflict') {
        const currentUpdatedAt = getRpcErrorHint(error) || expected_updated_at
        const conflictPayload: DraftConflictResponse = {
          code: 'draft_conflict',
          message: 'This draft was updated by another collaborator. Reload to continue editing.',
          current_updated_at: currentUpdatedAt,
          current_data: {
            updated_at: currentUpdatedAt,
            last_updated_by: null,
            last_updated_by_display_name: null,
          },
        }
        return NextResponse.json(conflictPayload, { status: 409 })
      }
      return createErrorResponse(error, 'Failed to delete draft image')
    }

    if (!isRecord(data) || !isRecord(data.draft) || typeof data.draft.updated_at !== 'string') {
      return createErrorResponse(new Error('Invalid draft image deletion response'), 'Failed to delete draft image')
    }

    const cleanupRows = parseStorageCleanupRows(data.cleanup)
    if (cleanupRows.length > 0) {
      const storageClient = getAdminClientWithAudit('delete draft image from storage')
      await cleanupDraftStorageObjects(storageClient, cleanupRows)
    }

    return NextResponse.json({
      success: true,
      draft: {
        updated_at: data.draft.updated_at,
        metadata: data.draft.metadata ?? null,
      },
      deleted_image_id: imageId,
    })
  } catch (error) {
    return createErrorResponse(error, 'Failed to delete draft image')
  }
}
