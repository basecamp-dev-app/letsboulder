type DraftSupabaseClient = ReturnType<typeof import('@supabase/ssr').createServerClient>

export interface AutoPublishCreatedCragResult {
  published: boolean
  error: unknown | null
}

export async function autoPublishCreatedCrag(input: {
  supabase: DraftSupabaseClient
  cragId: string | null
  userId: string
}): Promise<AutoPublishCreatedCragResult> {
  const { supabase, cragId, userId } = input
  if (!cragId) return { published: false, error: null }

  const { data: crag, error: cragError } = await supabase
    .from('crags')
    .select('id, created_by, publication_status, deleted_at, superseded_by')
    .eq('id', cragId)
    .maybeSingle()

  if (cragError) return { published: false, error: cragError }
  if (!crag || crag.deleted_at || crag.superseded_by) return { published: false, error: null }
  if (crag.publication_status === 'published') return { published: false, error: null }
  if (crag.publication_status !== 'review' || crag.created_by !== userId) {
    return { published: false, error: null }
  }

  const { data: status, error: publicationError } = await supabase.rpc('set_crag_publication_status', {
    p_crag_id: cragId,
    p_status: 'published',
    p_notes: 'Automatically published with creator submission',
  })

  if (publicationError) return { published: false, error: publicationError }
  if (status !== 'published') {
    return {
      published: false,
      error: new Error(`Unexpected crag publication status: ${String(status)}`),
    }
  }

  return { published: true, error: null }
}
