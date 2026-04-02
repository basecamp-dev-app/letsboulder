'use server'

import { getActionAuth } from '@/lib/actions/action-auth'
import { ok, type ActionResult } from '@/lib/actions/action-result'
import { resolveEffectiveClimbId } from '@/lib/climbs/effective-climb'
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

interface ConsensusBucket {
  index: number
  count: number
}

interface SaveClimbFeedbackInput {
  climbId: string
  gradeOpinion?: GradeOpinion | null
  starRating?: number | null
}

interface SaveClimbFeedbackResult {
  gradeOpinion: GradeOpinion | null
  starRating: number | null
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

function parseStarRating(value: unknown): number | null {
  if (value === null || value === undefined) return null
  if (typeof value !== 'number' || !Number.isInteger(value)) return null
  if (value < 1 || value > 5) return null
  return value
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

export async function saveClimbFeedbackAction(input: SaveClimbFeedbackInput): Promise<ActionResult<SaveClimbFeedbackResult>> {
  const auth = await getActionAuth()
  if (!auth.success) {
    return { success: false, error: auth.error, status: auth.status }
  }

  if (!auth.data?.userId) {
    return { success: false, error: 'Unauthorized', status: 401 }
  }

  const climbId = typeof input.climbId === 'string' ? input.climbId : null
  const gradeOpinion = parseGradeOpinion(input.gradeOpinion)
  const starRating = parseStarRating(input.starRating)

  if (!climbId) {
    return { success: false, error: 'climbId is required', status: 400 }
  }

  if (input.gradeOpinion !== null && input.gradeOpinion !== undefined && !gradeOpinion) {
    return { success: false, error: 'Invalid grade opinion', status: 400 }
  }

  if (input.starRating !== null && input.starRating !== undefined && starRating === null) {
    return { success: false, error: 'Invalid star rating', status: 400 }
  }

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
    console.error('Failed to fetch user log:', existingLogError)
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
    grade_vote_baseline: gradeOpinion ? normalizeGrade(climbRow.grade) : null,
  }

  const { error: updateError } = await supabase
    .from('user_climbs')
    .update(updatePayload)
    .eq('user_id', auth.data.userId)
    .eq('climb_id', effectiveClimbId)

  if (updateError) {
    console.error('Failed to save climb feedback:', updateError)
    return { success: false, error: 'Failed to save climb feedback', status: 500 }
  }

  const { data: allVotes, error: votesError } = await supabase
    .from('user_climbs')
    .select('grade_opinion, grade_vote_baseline')
    .eq('climb_id', effectiveClimbId)
    .not('grade_opinion', 'is', null)

  if (votesError) {
    console.error('Failed to compute grade consensus:', votesError)
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
      console.error('Failed to update climb grade from consensus:', climbUpdateError)
      return { success: false, error: 'Failed to update climb grade from consensus', status: 500 }
    }

    gradeUpdated = true
    updatedGrade = targetGrade
  }

  return ok({
    gradeOpinion,
    starRating,
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
