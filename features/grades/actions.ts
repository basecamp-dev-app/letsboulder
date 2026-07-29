'use server'

import { getActionAuth } from '@/lib/actions/action-auth'
import { fail, ok, type ActionResult } from '@/lib/actions/action-result'
import { validateActionInput } from '@/lib/actions/validate-action-input'
import { resolveEffectiveClimbId } from '@/features/climb/lib/effective-climb'
import { loadGradeDistribution, upsertGradeVote } from '@/features/grades/lib/grade-votes'
import { reportError } from '@/lib/errors'
import { isValidGrade } from '@/lib/grade-constants'
import { getServerClient } from '@/lib/supabase-server'
import { z } from 'zod'
import { hasOpenDataConsent, OPEN_DATA_CONSENT_REQUIRED } from '@/features/legal/lib/open-data-consent'

const submitGradeVoteSchema = z.object({
  climbId: z.string().trim().min(1, 'Climb not found'),
  grade: z.string().refine((value) => isValidGrade(value), 'Invalid grade'),
})

interface GradeVoteSummary {
  vote_count: number
  consensus_grade: string | null
  vote_distribution: Array<{ grade: string; vote_count: number }>
  message: string
}

export async function submitGradeVoteAction(climbId: string, grade: string): Promise<ActionResult<GradeVoteSummary>> {
  const validation = validateActionInput(submitGradeVoteSchema, { climbId, grade })
  if (!validation.success) {
    const status = validation.result.error === 'Climb not found' ? 404 : validation.result.status || 400
    return fail<GradeVoteSummary>(validation.result.error || 'Invalid request data', status)
  }

  const auth = await getActionAuth()
  if (!auth.success) {
    return { success: false, error: auth.error, status: auth.status }
  }

  if (!auth.data?.userId) {
    return { success: false, error: 'Authentication required', status: 401 }
  }

  const userId = auth.data.userId
  const { climbId: validatedClimbId, grade: validatedGrade } = validation.data

  const supabase = await getServerClient()
  if (!(await hasOpenDataConsent(supabase))) return { success: false, error: OPEN_DATA_CONSENT_REQUIRED, status: 428 }
  const effectiveClimbId = await resolveEffectiveClimbId(supabase, validatedClimbId)

  if (!effectiveClimbId) {
    return { success: false, error: 'Climb not found', status: 404 }
  }

  const { error: upsertError } = await upsertGradeVote({
    supabase,
    table: 'grade_votes',
    entityColumn: 'climb_id',
    entityId: effectiveClimbId,
    userId,
    grade: validatedGrade,
  })

  if (upsertError) {
    reportError(upsertError as Error, { message: 'Error saving grade vote' })
    return { success: false, error: 'Error saving grade vote', status: 500 }
  }

  const { voteCount, distribution: voteDistribution, consensusGrade, error: votesError } = await loadGradeDistribution({
    supabase,
    table: 'grade_votes',
    entityColumn: 'climb_id',
    entityId: effectiveClimbId,
  })

  if (votesError) {
    reportError(votesError as Error, { message: 'Error loading grade votes' })
    return { success: false, error: 'Error loading grade votes', status: 500 }
  }

  return ok({
    vote_count: voteCount,
    consensus_grade: consensusGrade,
    vote_distribution: voteDistribution,
    message: 'Grade vote recorded',
  })
}
