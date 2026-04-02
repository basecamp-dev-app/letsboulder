'use server'

import { getActionAuth } from '@/lib/actions/action-auth'
import { ok, type ActionResult } from '@/lib/actions/action-result'
import { resolveEffectiveClimbId } from '@/lib/climbs/effective-climb'
import { isValidGrade } from '@/lib/grade-constants'
import { getServerClient } from '@/lib/supabase-server'

interface GradeVoteSummary {
  vote_count: number
  consensus_grade: string | null
  vote_distribution: Array<{ grade: string; vote_count: number }>
  message: string
}

export async function submitGradeVoteAction(climbId: string, grade: string): Promise<ActionResult<GradeVoteSummary>> {
  if (!climbId) {
    return { success: false, error: 'Climb not found', status: 404 }
  }

  if (typeof grade !== 'string' || !isValidGrade(grade)) {
    return { success: false, error: 'Invalid grade', status: 400 }
  }

  const auth = await getActionAuth()
  if (!auth.success) {
    return { success: false, error: auth.error, status: auth.status }
  }

  if (!auth.data?.userId) {
    return { success: false, error: 'Authentication required', status: 401 }
  }

  const userId = auth.data.userId

  const supabase = await getServerClient()
  const effectiveClimbId = await resolveEffectiveClimbId(supabase as never, climbId)

  if (!effectiveClimbId) {
    return { success: false, error: 'Climb not found', status: 404 }
  }

  const { error: upsertError } = await supabase
    .from('grade_votes')
    .upsert(
      {
        climb_id: effectiveClimbId,
        user_id: userId,
        grade,
      },
      {
        onConflict: 'climb_id, user_id',
      }
    )

  if (upsertError) {
    console.error('Error saving grade vote:', upsertError)
    return { success: false, error: 'Error saving grade vote', status: 500 }
  }

  const { data: gradeVotes, error: votesError } = await supabase
    .from('grade_votes')
    .select('grade')
    .eq('climb_id', effectiveClimbId)

  if (votesError) {
    console.error('Error loading grade votes:', votesError)
    return { success: false, error: 'Error loading grade votes', status: 500 }
  }

  const gradeDistribution = (gradeVotes || []).reduce<Record<string, number>>((acc, vote) => {
    acc[vote.grade] = (acc[vote.grade] || 0) + 1
    return acc
  }, {})

  const voteDistribution = Object.entries(gradeDistribution)
    .map(([voteGrade, voteCount]) => ({ grade: voteGrade, vote_count: voteCount }))
    .sort((a, b) => b.vote_count - a.vote_count)

  return ok({
    vote_count: gradeVotes?.length || 0,
    consensus_grade: voteDistribution[0]?.grade || null,
    vote_distribution: voteDistribution,
    message: 'Grade vote recorded',
  })
}
