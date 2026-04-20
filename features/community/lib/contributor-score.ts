import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json } from '@/types/database'

type AppSupabaseClient = SupabaseClient<Database>
function callRpc<Result>(
  supabase: AppSupabaseClient,
  fn: string,
  args: Record<string, unknown>
) {
  return (supabase as unknown as SupabaseClient).rpc(fn, args) as unknown as Promise<{ data: Result; error: { message?: string } | null }>
}

interface ScoreContext {
  placeId: string | null
  cragId: string | null
}

async function loadImageScoreContext(supabase: AppSupabaseClient, imageId: string): Promise<ScoreContext> {
  const { data } = await supabase
    .from('images')
    .select('crag_id, crags(place_id)')
    .eq('id', imageId)
    .maybeSingle()

  const crag = Array.isArray(data?.crags) ? data.crags[0] : data?.crags

  return {
    placeId: typeof crag?.place_id === 'string' ? crag.place_id : null,
    cragId: typeof data?.crag_id === 'string' ? data.crag_id : null,
  }
}

export async function recordSubmissionPublishedEvent(supabase: AppSupabaseClient, input: {
  userId: string
  imageId: string
  sourceId: string
}) {
  const context = await loadImageScoreContext(supabase, input.imageId)

  const { data: eventId, error } = await callRpc<string | null>(supabase, 'record_contribution_event', {
    p_user_id: input.userId,
    p_event_type: 'submission_published',
    p_score_delta: 20,
    p_source_table: 'images',
    p_source_id: input.sourceId,
    p_place_id: context.placeId,
    p_crag_id: context.cragId,
    p_image_id: input.imageId,
    p_climb_id: null,
    p_metadata: { kind: 'submission_published' } satisfies Json,
    p_status: 'accepted',
  })

  if (error) throw error

  await callRpc<string | null>(supabase, 'open_missing_topo_bounty', {
    p_image_id: input.imageId,
    p_created_by_event_id: eventId,
  })
}

export async function recordAcceptedWikiContribution(supabase: AppSupabaseClient, input: {
  userId: string
  imageId: string
  sourceId: string
  climbId?: string | null
  metadata?: Json
}) {
  const bountyResult = await callRpc<string | null>(supabase, 'resolve_missing_topo_bounty', {
    p_image_id: input.imageId,
    p_user_id: input.userId,
    p_source_table: 'submission_edit_history',
    p_source_id: input.sourceId,
    p_metadata: (input.metadata || {}) as Json,
  })

  if (bountyResult.error) throw bountyResult.error
  if (bountyResult.data) return

  const context = await loadImageScoreContext(supabase, input.imageId)
  const { error } = await callRpc<string | null>(supabase, 'record_contribution_event', {
    p_user_id: input.userId,
    p_event_type: 'wiki_edit_accepted',
    p_score_delta: 8,
    p_source_table: 'submission_edit_history',
    p_source_id: input.sourceId,
    p_place_id: context.placeId,
    p_crag_id: context.cragId,
    p_image_id: input.imageId,
    p_climb_id: input.climbId || null,
    p_metadata: (input.metadata || {}) as Json,
    p_status: 'accepted',
  })

  if (error) throw error
}

export async function recordCorrectionApprovedEvent(supabase: AppSupabaseClient, input: {
  userId: string
  correctionId: string
  climbId: string
}) {
  const { data: climb } = await supabase
    .from('climbs')
    .select('id, crag_id, crags(place_id)')
    .eq('id', input.climbId)
    .maybeSingle()

  const crag = Array.isArray(climb?.crags) ? climb.crags[0] : climb?.crags

  const { error } = await callRpc<string | null>(supabase, 'record_contribution_event', {
    p_user_id: input.userId,
    p_event_type: 'correction_approved',
    p_score_delta: 15,
    p_source_table: 'climb_corrections',
    p_source_id: input.correctionId,
    p_place_id: typeof crag?.place_id === 'string' ? crag.place_id : null,
    p_crag_id: typeof climb?.crag_id === 'string' ? climb.crag_id : null,
    p_image_id: null,
    p_climb_id: input.climbId,
    p_metadata: { kind: 'correction_approved' } satisfies Json,
    p_status: 'accepted',
  })

  if (error) throw error
}

export async function recordVerificationAcceptedEvent(supabase: AppSupabaseClient, input: {
  userId: string
  verificationId: string
  climbId: string
}) {
  const { data: climb } = await supabase
    .from('climbs')
    .select('id, crag_id, crags(place_id)')
    .eq('id', input.climbId)
    .maybeSingle()

  const crag = Array.isArray(climb?.crags) ? climb.crags[0] : climb?.crags

  const { error } = await callRpc<string | null>(supabase, 'record_contribution_event', {
    p_user_id: input.userId,
    p_event_type: 'verification_accepted',
    p_score_delta: 5,
    p_source_table: 'climb_verifications',
    p_source_id: input.verificationId,
    p_place_id: typeof crag?.place_id === 'string' ? crag.place_id : null,
    p_crag_id: typeof climb?.crag_id === 'string' ? climb.crag_id : null,
    p_image_id: null,
    p_climb_id: input.climbId,
    p_metadata: { kind: 'verification_accepted' } satisfies Json,
    p_status: 'accepted',
  })

  if (error) throw error
}
