import { NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/supabase-server'
import { createErrorResponse } from '@/lib/errors'
import { cleanupDraftStorageObjects } from '@/lib/media/draft-storage'
import type { Database } from '@/types/database'

type DraftStorageRow = Pick<
  Database['public']['Tables']['submission_draft_images']['Row'],
  'storage_provider' | 'storage_bucket' | 'storage_path'
>

export async function deleteDraft(
  id: string,
  middlewareResult: { supabase: ReturnType<typeof import('@supabase/ssr').createServerClient>; userId: string }
) {
  if (!id) {
    return NextResponse.json({ error: 'Draft ID is required' }, { status: 400 })
  }

  const { supabase, userId } = middlewareResult
  const storageClient = getAdminClient()

  try {
    const { data: draft, error: draftError } = await supabase
      .from('submission_drafts')
      .select('id, user_id, status')
      .eq('id', id)
      .single()

    if (draftError || !draft) {
      return NextResponse.json({ error: 'Draft not found' }, { status: 404 })
    }

    if (draft.user_id !== userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    if (draft.status !== 'draft') {
      return NextResponse.json({ error: 'Only draft submissions can be deleted' }, { status: 400 })
    }

    const { data: draftImages, error: draftImagesError } = await supabase
      .from('submission_draft_images')
      .select('storage_provider, storage_bucket, storage_path')
      .eq('draft_id', id)

    if (draftImagesError) {
      return createErrorResponse(draftImagesError, 'Failed to read draft image storage paths')
    }

    const draftStorageRows = (draftImages || []) as DraftStorageRow[]

    const { data: deletedDraft, error: deleteError } = await supabase
      .from('submission_drafts')
      .delete()
      .eq('id', id)
      .select('id')
      .maybeSingle()

    if (deleteError) {
      return createErrorResponse(deleteError, 'Failed to delete submission draft')
    }

    if (!deletedDraft) {
      return NextResponse.json({ error: 'Failed to delete submission draft' }, { status: 500 })
    }

    await cleanupDraftStorageObjects(storageClient, draftStorageRows)

    return NextResponse.json({ success: true })
  } catch (error) {
    return createErrorResponse(error, 'Failed to delete submission draft')
  }
}
