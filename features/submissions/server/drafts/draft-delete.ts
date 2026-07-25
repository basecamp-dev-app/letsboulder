import { NextResponse } from 'next/server'
import { getAdminClientWithAudit } from '@/lib/supabase-admin'
import { createErrorResponse } from '@/lib/errors'
import { cleanupDraftStorageObjects } from '@/lib/media/draft-storage'
import { getRpcErrorDetail, isRecord, parseStorageCleanupRows } from '@/lib/media/deletion-rpc'

export async function deleteDraft(
  id: string,
  middlewareResult: { supabase: ReturnType<typeof import('@supabase/ssr').createServerClient>; userId: string }
) {
  if (!id) {
    return NextResponse.json({ error: 'Draft ID is required' }, { status: 400 })
  }

  const { supabase } = middlewareResult

  try {
    const { data, error: deleteError } = await supabase.rpc('delete_submission_draft_atomic', {
      p_draft_id: id,
    })

    if (deleteError) {
      const detail = getRpcErrorDetail(deleteError)
      if (detail === 'not_found') return NextResponse.json({ error: 'Draft not found' }, { status: 404 })
      if (detail === 'permission_denied') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      if (detail === 'draft_not_editable') {
        return NextResponse.json({ error: 'Only draft submissions can be deleted' }, { status: 409 })
      }
      if (detail === 'draft_conflict') {
        return NextResponse.json({ error: 'The draft changed while it was being deleted' }, { status: 409 })
      }
      return createErrorResponse(deleteError, 'Failed to delete submission draft')
    }

    if (!isRecord(data)) {
      return createErrorResponse(new Error('Invalid draft deletion response'), 'Failed to delete submission draft')
    }

    const cleanupRows = parseStorageCleanupRows(data.cleanup)
    if (cleanupRows.length > 0) {
      const storageClient = getAdminClientWithAudit('delete draft storage cleanup')
      await cleanupDraftStorageObjects(storageClient, cleanupRows)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    return createErrorResponse(error, 'Failed to delete submission draft')
  }
}
