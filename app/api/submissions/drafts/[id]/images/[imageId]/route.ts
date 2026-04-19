import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAdminClientWithAudit } from '@/lib/supabase-admin'
import { withApiMiddleware } from '@/lib/csrf-server'
import { createErrorResponse } from '@/lib/errors'
import { cleanupDraftStorageObjects } from '@/lib/media/draft-storage'
import { parseWithSchema } from '@/lib/api-validation'
import type { Database } from '@/types/database'

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

interface ProfileRow {
  id: string
  username: string | null
  display_name: string | null
}

type DraftImageRow = Pick<
  Database['public']['Tables']['submission_draft_images']['Row'],
  'id' | 'display_order' | 'storage_provider' | 'storage_bucket' | 'storage_path'
>

function resolveDisplayName(profile: ProfileRow | null): string | null {
  if (!profile) return null
  if (profile.display_name) return profile.display_name
  if (profile.username) return profile.username
  return null
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

  const { supabase, userId } = middlewareResult

  const storageClient = getAdminClientWithAudit('delete draft image from storage')

  try {
    const { data: draft, error: draftError } = await supabase
      .from('submission_drafts')
      .select('id, user_id, status, updated_at, last_edited_by, metadata')
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

      const conflictPayload: DraftConflictResponse = {
        code: 'draft_conflict',
        message: 'This draft was updated by another collaborator. Reload to continue editing.',
        current_updated_at: draft.updated_at,
        current_data: {
          updated_at: draft.updated_at,
          last_updated_by: draft.last_edited_by,
          last_updated_by_display_name: lastUpdatedByDisplayName,
        },
      }
      return NextResponse.json(conflictPayload, { status: 409 })
    }

    const { data: imageRows, error: imageRowsError } = await supabase
      .from('submission_draft_images')
      .select('id, display_order, storage_provider, storage_bucket, storage_path')
      .eq('draft_id', id)
      .order('display_order', { ascending: true })

    if (imageRowsError) {
      return createErrorResponse(imageRowsError, 'Failed to read draft images')
    }

    const draftImages = (imageRows || []) as DraftImageRow[]
    const imageToDelete = draftImages.find((image) => image.id === imageId) || null

    if (!imageToDelete) {
      return NextResponse.json({ error: 'Draft image not found' }, { status: 404 })
    }

    if (draftImages.length <= 1) {
      return NextResponse.json({ error: 'A draft must keep at least one face image' }, { status: 400 })
    }

    const { error: deleteImageError } = await supabase
      .from('submission_draft_images')
      .delete()
      .eq('id', imageId)
      .eq('draft_id', id)

    if (deleteImageError) {
      return createErrorResponse(deleteImageError, 'Failed to delete draft image')
    }

    await cleanupDraftStorageObjects(storageClient, [imageToDelete])

    const remainingImages = draftImages.filter((image) => image.id !== imageId)
    for (let index = 0; index < remainingImages.length; index += 1) {
      const image = remainingImages[index]
      if (image.display_order === index) continue
      const { error: reorderError } = await supabase
        .from('submission_draft_images')
        .update({ display_order: index })
        .eq('id', image.id)
        .eq('draft_id', id)

      if (reorderError) {
        return createErrorResponse(reorderError, 'Failed to reorder draft images')
      }
    }

    const metadata = draft.metadata && typeof draft.metadata === 'object' && !Array.isArray(draft.metadata)
      ? draft.metadata as Record<string, unknown>
      : {}
    const deletedIndex = draftImages.findIndex((image) => image.id === imageId)
    const currentPrimaryIndex = typeof metadata.primaryIndex === 'number' ? metadata.primaryIndex : 0

    const nextPrimaryIndex = currentPrimaryIndex > deletedIndex
      ? currentPrimaryIndex - 1
      : currentPrimaryIndex >= remainingImages.length
        ? Math.max(remainingImages.length - 1, 0)
        : currentPrimaryIndex

    const faceDirectionsSource = metadata.faceDirectionsByImage
    const nextFaceDirectionsByImage: Record<string, unknown> = {}
    if (faceDirectionsSource && typeof faceDirectionsSource === 'object' && !Array.isArray(faceDirectionsSource)) {
      for (const [rawKey, value] of Object.entries(faceDirectionsSource)) {
        const numericKey = Number(rawKey)
        if (!Number.isInteger(numericKey) || numericKey === deletedIndex) continue
        const nextKey = numericKey > deletedIndex ? numericKey - 1 : numericKey
        nextFaceDirectionsByImage[String(nextKey)] = value
      }
    }

    const nextMetadata: Record<string, unknown> = {
      ...metadata,
      primaryIndex: nextPrimaryIndex,
      faceDirectionsByImage: nextFaceDirectionsByImage,
    }

    const { data: updatedDraft, error: updateDraftError } = await supabase
      .from('submission_drafts')
      .update({
        metadata: nextMetadata,
        updated_at: new Date().toISOString(),
        last_edited_by: userId,
      })
      .eq('id', id)
      .eq('status', 'draft')
      .select('updated_at, metadata')
      .maybeSingle()

    if (updateDraftError) {
      return createErrorResponse(updateDraftError, 'Failed to update draft metadata')
    }

    return NextResponse.json({
      success: true,
      draft: {
        updated_at: updatedDraft?.updated_at || new Date().toISOString(),
        metadata: updatedDraft?.metadata || nextMetadata,
      },
      deleted_image_id: imageId,
    })
  } catch (error) {
    return createErrorResponse(error, 'Failed to delete draft image')
  }
}
