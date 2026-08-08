'use server'

import { getActionAuth } from '@/lib/actions/action-auth'
import { fail, ok, type ActionResult } from '@/lib/actions/action-result'
import { validateActionInput } from '@/lib/actions/validate-action-input'
import { resolveEffectiveClimbId } from '@/features/climb/lib/effective-climb'
import {
  clampGradeIndex,
  GRADE_CONSENSUS_MIN_CONFIDENCE,
  GRADE_CONSENSUS_MIN_VOTES,
  GRADE_OPINIONS,
  getGradeShift,
  type GradeOpinion,
} from '@/lib/grade-feedback'
import { normalizeGrade, GRADES } from '@/lib/grades'
import { getServerClient } from '@/lib/supabase-server'
import { reportError } from '@/lib/errors'
import { z } from 'zod'

interface ConsensusBucket {
  index: number
  count: number
}

interface SaveClimbFeedbackInput {
  climbId: string
  gradeOpinion?: GradeOpinion | null
  starRating?: number | null
  notes?: string | null
}

interface SaveClimbFeedbackResult {
  gradeOpinion: GradeOpinion | null
  starRating: number | null
  notes: string | null
  consensus: {
    totalVotes: number
    confidence: number
    thresholdVotes: number
    thresholdConfidence: number
    targetGrade: string | null
    applied: boolean
  }
  gradeUpdated: boolean
  updatedGrade: string | null
}

function parseGradeOpinion(value: unknown): GradeOpinion | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim().toLowerCase()
  return (GRADE_OPINIONS as readonly string[]).includes(normalized) ? (normalized as GradeOpinion) : null
}

function mapOpinionToSuggestedGradeIndex(opinion: GradeOpinion, baseline: string): number | null {
  const normalizedBaseline = normalizeGrade(baseline)
  if (!normalizedBaseline) return null
  const baselineIndex = GRADES.indexOf(normalizedBaseline)
  if (baselineIndex === -1) return null

  const shifted = baselineIndex + getGradeShift(opinion)
  return clampGradeIndex(shifted)
}

function deriveConsensusGrade(votes: Array<{ grade_opinion: string | null; grade_vote_baseline: string | null }>) {
  const mappedVotes = votes
    .map((vote) => {
      const opinion = parseGradeOpinion(vote.grade_opinion)
      if (!opinion || !vote.grade_vote_baseline) return null
      const suggestedIndex = mapOpinionToSuggestedGradeIndex(opinion, vote.grade_vote_baseline)
      if (suggestedIndex === null) return null
      return suggestedIndex
    })
    .filter((value): value is number => value !== null)

  if (mappedVotes.length === 0) {
    return {
      totalVotes: 0,
      confidence: 0,
      targetGrade: null as string | null,
    }
  }

  const buckets = new Map<number, number>()
  for (const index of mappedVotes) {
    buckets.set(index, (buckets.get(index) ?? 0) + 1)
  }

  const ranked = Array.from(buckets.entries())
    .map(([index, count]) => ({ index, count }))
    .sort((a, b) => b.count - a.count)

  const top = ranked[0] as ConsensusBucket
  const second = ranked[1]
  const uniqueTop = !second || top.count > second.count
  const confidence = mappedVotes.length > 0 ? top.count / mappedVotes.length : 0

  if (!uniqueTop) {
    return {
      totalVotes: mappedVotes.length,
      confidence,
      targetGrade: null as string | null,
    }
  }

  return {
    totalVotes: mappedVotes.length,
    confidence,
    targetGrade: GRADES[top.index] ?? null,
  }
}

const saveClimbFeedbackSchema = z.object({
  climbId: z.string().trim().min(1, 'climbId is required'),
  gradeOpinion: z.enum(GRADE_OPINIONS).nullable().optional(),
  starRating: z.number().int().min(1, 'Invalid star rating').max(5, 'Invalid star rating').nullable().optional(),
  notes: z.string().trim().max(500, 'Notes must be under 500 characters').nullable().optional(),
})

export async function saveClimbFeedbackAction(input: SaveClimbFeedbackInput): Promise<ActionResult<SaveClimbFeedbackResult>> {
  const validation = validateActionInput(saveClimbFeedbackSchema, input)
  if (!validation.success) return fail<SaveClimbFeedbackResult>(validation.result.error || 'Invalid request data', validation.result.status || 400)

  const auth = await getActionAuth()
  if (!auth.success) {
    return { success: false, error: auth.error, status: auth.status }
  }

  if (!auth.data?.userId) {
    return { success: false, error: 'Unauthorized', status: 401 }
  }

  const climbId = validation.data.climbId
  const gradeOpinion = validation.data.gradeOpinion ?? null
  const starRating = validation.data.starRating ?? null
  const notes = validation.data.notes ?? null

  const supabase = await getServerClient()
  const effectiveClimbId = await resolveEffectiveClimbId(supabase as never, climbId)

  if (!effectiveClimbId) {
    return { success: false, error: 'Climb not found', status: 404 }
  }

  const { data: existingLog, error: existingLogError } = await supabase
    .from('user_climbs')
    .select('id')
    .eq('user_id', auth.data.userId)
    .eq('climb_id', effectiveClimbId)
    .maybeSingle()

  if (existingLogError) {
    reportError(existingLogError, { message: 'Failed to fetch user log' })
    return { success: false, error: 'Failed to fetch user log', status: 500 }
  }

  if (!existingLog) {
    return { success: false, error: 'You must log this climb first', status: 400 }
  }

  const { data: climbRow, error: climbError } = await supabase
    .from('climbs')
    .select('grade')
    .eq('id', effectiveClimbId)
    .single()

  if (climbError || !climbRow) {
    return { success: false, error: 'Climb not found', status: 404 }
  }

  const updatePayload: Record<string, unknown> = {
    grade_opinion: gradeOpinion,
    star_rating: starRating,
    notes,
    grade_vote_baseline: gradeOpinion ? normalizeGrade(climbRow.grade) : null,
    updated_at: new Date().toISOString(),
  }

  const { error: updateError } = await supabase
    .from('user_climbs')
    .update(updatePayload)
    .eq('user_id', auth.data.userId)
    .eq('climb_id', effectiveClimbId)

  if (updateError) {
    reportError(updateError, { message: 'Failed to save climb feedback' })
    return { success: false, error: 'Failed to save climb feedback', status: 500 }
  }

  const { data: allVotes, error: votesError } = await supabase
    .from('user_climbs')
    .select('grade_opinion, grade_vote_baseline')
    .eq('climb_id', effectiveClimbId)
    .not('grade_opinion', 'is', null)

  if (votesError) {
    reportError(votesError, { message: 'Failed to compute grade consensus' })
    return { success: false, error: 'Failed to compute grade consensus', status: 500 }
  }

  const { totalVotes, confidence, targetGrade } = deriveConsensusGrade(allVotes || [])
  const meetsThreshold = totalVotes >= GRADE_CONSENSUS_MIN_VOTES && confidence >= GRADE_CONSENSUS_MIN_CONFIDENCE && !!targetGrade

  let gradeUpdated = false
  let updatedGrade = normalizeGrade(climbRow.grade)

  if (meetsThreshold && targetGrade && targetGrade !== updatedGrade) {
    const { error: climbUpdateError } = await supabase
      .from('climbs')
      .update({ grade: targetGrade })
      .eq('shared_climb_id', effectiveClimbId)

    if (climbUpdateError) {
      reportError(climbUpdateError, { message: 'Failed to update climb grade from consensus' })
      return { success: false, error: 'Failed to update climb grade from consensus', status: 500 }
    }

    gradeUpdated = true
    updatedGrade = targetGrade
  }

  return ok({
    gradeOpinion,
    starRating,
    notes,
    consensus: {
      totalVotes,
      confidence,
      thresholdVotes: GRADE_CONSENSUS_MIN_VOTES,
      thresholdConfidence: GRADE_CONSENSUS_MIN_CONFIDENCE,
      targetGrade,
      applied: meetsThreshold,
    },
    gradeUpdated,
    updatedGrade,
  })
}
