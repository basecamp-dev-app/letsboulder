import type { SupabaseClient } from '@supabase/supabase-js'
import { getAdminClientWithAudit } from '@/lib/supabase-admin'
import type { Database, Json } from '@/types/database'

type AdminClient = SupabaseClient<Database>
type ImageRow = Database['public']['Tables']['images']['Row']
type WikiEditRow = Database['public']['Tables']['submission_edit_history']['Row']
type CorrectionRow = Database['public']['Tables']['climb_corrections']['Row']
type VerificationRow = Database['public']['Tables']['climb_verifications']['Row']

interface ScoreContext {
  placeId: string | null
  cragId: string | null
}

function getScoreAdminClient(reason: string): AdminClient {
  return getAdminClientWithAudit(reason) as unknown as AdminClient
}

function loadImageScoreContext(image: Pick<ImageRow, 'crag_id' | 'place_id'>): ScoreContext {
  return {
    placeId: image.place_id,
    cragId: image.crag_id,
  }
}

async function loadClimbScoreContext(supabase: AdminClient, climbId: string): Promise<ScoreContext> {
  const { data: climb, error } = await supabase
    .from('climbs')
    .select('crag_id, place_id')
    .eq('id', climbId)
    .maybeSingle()

  if (error) throw error
  if (!climb) throw new Error('Contribution climb source not found')

  return {
    placeId: climb.place_id,
    cragId: climb.crag_id,
  }
}

function climbIdFromWikiEdit(edit: Pick<WikiEditRow, 'after_data'>): string | null {
  if (!edit.after_data || typeof edit.after_data !== 'object' || Array.isArray(edit.after_data)) return null
  return typeof edit.after_data.climb_id === 'string' ? edit.after_data.climb_id : null
}

export async function recordSubmissionPublishedEvent(imageId: string) {
  const supabase = getScoreAdminClient('record trusted submission contribution score')
  const { data, error: imageError } = await supabase
    .from('images')
    .select('id, created_by, crag_id, place_id, submission_id, status, visibility, moderation_status')
    .eq('id', imageId)
    .maybeSingle()

  if (imageError) throw imageError
  const image: Pick<ImageRow, 'id' | 'created_by' | 'crag_id' | 'place_id' | 'submission_id' | 'status' | 'visibility' | 'moderation_status'> | null = data
  if (!image?.created_by) throw new Error('Published image contribution source has no beneficiary')
  if (
    !image.submission_id
    || image.status !== 'approved'
    || image.visibility !== 'public'
    || !['approved', 'skipped'].includes(image.moderation_status ?? '')
  ) {
    throw new Error('Published image contribution source is not public')
  }

  const context = loadImageScoreContext(image)
  const { data: eventId, error } = await supabase.rpc('record_contribution_event', {
    p_user_id: image.created_by,
    p_event_type: 'submission_published',
    p_score_delta: 20,
    p_source_table: 'images',
    p_source_id: image.id,
    ...(context.placeId ? { p_place_id: context.placeId } : {}),
    ...(context.cragId ? { p_crag_id: context.cragId } : {}),
    p_image_id: image.id,
    p_metadata: { kind: 'submission_published' } satisfies Json,
    p_status: 'accepted',
  })

  if (error) throw error

  const { error: bountyError } = await supabase.rpc('open_missing_topo_bounty', {
    p_image_id: image.id,
    ...(eventId ? { p_created_by_event_id: eventId } : {}),
  })
  if (bountyError) throw bountyError
}

export async function recordAcceptedWikiContribution(editHistoryId: string) {
  const supabase = getScoreAdminClient('record trusted accepted wiki contribution score')
  const { data, error: editError } = await supabase
    .from('submission_edit_history')
    .select('id, edited_by, image_id, edit_kind, moderation_state, after_data')
    .eq('id', editHistoryId)
    .maybeSingle()

  if (editError) throw editError
  const edit: Pick<WikiEditRow, 'id' | 'edited_by' | 'image_id' | 'edit_kind' | 'moderation_state' | 'after_data'> | null = data
  if (!edit || edit.moderation_state !== 'accepted') {
    throw new Error('Accepted wiki contribution source not found')
  }

  const { data: image, error: imageError } = await supabase
    .from('images')
    .select('id, crag_id, place_id')
    .eq('id', edit.image_id)
    .maybeSingle()

  if (imageError) throw imageError
  if (!image) throw new Error('Wiki contribution image source not found')

  const climbId = climbIdFromWikiEdit(edit)
  const metadata = {
    edit_kind: edit.edit_kind,
    ...(climbId ? { climb_id: climbId } : {}),
  } satisfies Json
  const bountyResult = await supabase.rpc('resolve_missing_topo_bounty', {
    p_image_id: edit.image_id,
    p_user_id: edit.edited_by,
    p_source_table: 'submission_edit_history',
    p_source_id: edit.id,
    p_metadata: metadata,
  })

  if (bountyResult.error) throw bountyResult.error
  if (bountyResult.data) return

  const context = loadImageScoreContext(image)
  const { error } = await supabase.rpc('record_contribution_event', {
    p_user_id: edit.edited_by,
    p_event_type: 'wiki_edit_accepted',
    p_score_delta: 8,
    p_source_table: 'submission_edit_history',
    p_source_id: edit.id,
    ...(context.placeId ? { p_place_id: context.placeId } : {}),
    ...(context.cragId ? { p_crag_id: context.cragId } : {}),
    p_image_id: edit.image_id,
    ...(climbId ? { p_climb_id: climbId } : {}),
    p_metadata: metadata,
    p_status: 'accepted',
  })

  if (error) throw error
}

export async function recordCorrectionApprovedEvent(correctionId: string) {
  const supabase = getScoreAdminClient('record trusted approved correction contribution score')
  const { data, error: correctionError } = await supabase
    .from('climb_corrections')
    .select('id, user_id, climb_id, status')
    .eq('id', correctionId)
    .maybeSingle()

  if (correctionError) throw correctionError
  const correction: Pick<CorrectionRow, 'id' | 'user_id' | 'climb_id' | 'status'> | null = data
  if (!correction || correction.status !== 'approved') {
    throw new Error('Approved correction contribution source not found')
  }

  const context = await loadClimbScoreContext(supabase, correction.climb_id)
  const { error } = await supabase.rpc('record_contribution_event', {
    p_user_id: correction.user_id,
    p_event_type: 'correction_approved',
    p_score_delta: 15,
    p_source_table: 'climb_corrections',
    p_source_id: correction.id,
    ...(context.placeId ? { p_place_id: context.placeId } : {}),
    ...(context.cragId ? { p_crag_id: context.cragId } : {}),
    p_climb_id: correction.climb_id,
    p_metadata: { kind: 'correction_approved' } satisfies Json,
    p_status: 'accepted',
  })

  if (error) throw error
}

export async function recordVerificationAcceptedEvent(verificationId: string) {
  const supabase = getScoreAdminClient('record trusted accepted verification contribution score')
  const { data, error: verificationError } = await supabase
    .from('climb_verifications')
    .select('id, user_id, climb_id')
    .eq('id', verificationId)
    .maybeSingle()

  if (verificationError) throw verificationError
  const verification: Pick<VerificationRow, 'id' | 'user_id' | 'climb_id'> | null = data
  if (!verification) throw new Error('Accepted verification contribution source not found')

  const { count, error: countError } = await supabase
    .from('climb_verifications')
    .select('id', { count: 'exact', head: true })
    .eq('climb_id', verification.climb_id)

  if (countError) throw countError
  if ((count ?? 0) < 3) throw new Error('Verification contribution has not been accepted')

  const context = await loadClimbScoreContext(supabase, verification.climb_id)
  const { error } = await supabase.rpc('record_contribution_event', {
    p_user_id: verification.user_id,
    p_event_type: 'verification_accepted',
    p_score_delta: 5,
    p_source_table: 'climb_verifications',
    p_source_id: verification.id,
    ...(context.placeId ? { p_place_id: context.placeId } : {}),
    ...(context.cragId ? { p_crag_id: context.cragId } : {}),
    p_climb_id: verification.climb_id,
    p_metadata: { kind: 'verification_accepted' } satisfies Json,
    p_status: 'accepted',
  })

  if (error) throw error
}
