import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { withCsrfProtection } from '@/lib/csrf-server'
import { createErrorResponse } from '@/lib/errors'
import { rateLimit, createRateLimitResponse } from '@/lib/rate-limit'
import { normalizeGrade, GRADES } from '@/lib/grades'
import {
  clampGradeIndex,
  GRADE_CONSENSUS_MIN_CONFIDENCE,
  GRADE_CONSENSUS_MIN_VOTES,
  GRADE_OPINIONS,
  getGradeShift,
  type GradeOpinion,
} from '@/lib/grade-feedback'

interface ConsensusBucket {
  index: number
  count: number
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

export async function PUT(request: NextRequest) {
  const csrfResult = await withCsrfProtection(request)
  if (!csrfResult.valid) return csrfResult.response!

  const cookies = request.cookies
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookies.getAll() },
        setAll() {},
      },
    }
  )

  try {
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const rateLimitResult = rateLimit(request, 'authenticatedWrite', user.id)
    const rateLimitResponse = createRateLimitResponse(rateLimitResult)
    if (!rateLimitResult.success) {
      return rateLimitResponse
    }

    const body = await request.json()
    const climbId = typeof body?.climbId === 'string' ? body.climbId : null
    const gradeOpinion = parseGradeOpinion(body?.gradeOpinion)
    const starRating = parseStarRating(body?.starRating)

    if (!climbId) {
      return NextResponse.json({ error: 'climbId is required' }, { status: 400 })
    }

    if (body?.gradeOpinion !== null && body?.gradeOpinion !== undefined && !gradeOpinion) {
      return NextResponse.json({ error: 'Invalid grade opinion' }, { status: 400 })
    }

    if (body?.starRating !== null && body?.starRating !== undefined && starRating === null) {
      return NextResponse.json({ error: 'Invalid star rating' }, { status: 400 })
    }

    const { data: existingLog, error: existingLogError } = await supabase
      .from('user_climbs')
      .select('id')
      .eq('user_id', user.id)
      .eq('climb_id', climbId)
      .maybeSingle()

    if (existingLogError) {
      return createErrorResponse(existingLogError, 'Failed to fetch user log')
    }

    if (!existingLog) {
      return NextResponse.json({ error: 'You must log this climb first' }, { status: 400 })
    }

    const { data: climbRow, error: climbError } = await supabase
      .from('climbs')
      .select('grade')
      .eq('id', climbId)
      .single()

    if (climbError || !climbRow) {
      return NextResponse.json({ error: 'Climb not found' }, { status: 404 })
    }

    const updatePayload: Record<string, unknown> = {
      grade_opinion: gradeOpinion,
      star_rating: starRating,
      grade_vote_baseline: gradeOpinion ? normalizeGrade(climbRow.grade) : null,
    }

    const { error: updateError } = await supabase
      .from('user_climbs')
      .update(updatePayload)
      .eq('user_id', user.id)
      .eq('climb_id', climbId)

    if (updateError) {
      return createErrorResponse(updateError, 'Failed to save climb feedback')
    }

    const { data: allVotes, error: votesError } = await supabase
      .from('user_climbs')
      .select('grade_opinion, grade_vote_baseline')
      .eq('climb_id', climbId)
      .not('grade_opinion', 'is', null)

    if (votesError) {
      return createErrorResponse(votesError, 'Failed to compute grade consensus')
    }

    const { totalVotes, confidence, targetGrade } = deriveConsensusGrade(allVotes || [])

    const meetsThreshold =
      totalVotes >= GRADE_CONSENSUS_MIN_VOTES &&
      confidence >= GRADE_CONSENSUS_MIN_CONFIDENCE &&
      !!targetGrade

    let gradeUpdated = false
    let updatedGrade = normalizeGrade(climbRow.grade)

    if (meetsThreshold && targetGrade && targetGrade !== updatedGrade) {
      const { error: climbUpdateError } = await supabase
        .from('climbs')
        .update({ grade: targetGrade })
        .eq('id', climbId)

      if (climbUpdateError) {
        return createErrorResponse(climbUpdateError, 'Failed to update climb grade from consensus')
      }

      gradeUpdated = true
      updatedGrade = targetGrade
    }

    return NextResponse.json({
      success: true,
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
  } catch (error) {
    return createErrorResponse(error, 'Save climb feedback error')
  }
}
