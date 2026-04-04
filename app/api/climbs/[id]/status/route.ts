import { NextRequest, NextResponse } from 'next/server'
import { getServerClientFromRequest } from '@/lib/supabase-server'
import { createErrorResponse } from '@/lib/errors'
import { resolveUserIdWithFallback } from '@/lib/auth-context'
import { resolveEffectiveClimbId } from '@/features/climb/lib/effective-climb'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = getServerClientFromRequest(request)

  try {
    const { id: climbId } = await params

    // Batch 1: independent lookups
    const [{ userId }, effectiveClimbId] = await Promise.all([
      resolveUserIdWithFallback(request, supabase),
      resolveEffectiveClimbId(supabase as never, climbId),
    ])

    if (!effectiveClimbId) {
      return NextResponse.json(
        { error: 'Climb not found' },
        { status: 404 }
      )
    }

    // Batch 2: queries that only depend on climbId / effectiveClimbId
    const [climbResult, verificationResult, gradeVotesResult, correctionsResult] = await Promise.all([
      supabase.from('climbs').select('id, user_id, name, grade, status, created_at').eq('id', climbId).single(),
      supabase.from('climb_verifications').select('id', { count: 'exact' }).eq('climb_id', climbId),
      supabase.from('grade_votes').select('grade').eq('climb_id', effectiveClimbId),
      supabase
        .from('climb_corrections')
        .select(`
          id,
          climb_id,
          user_id,
          correction_type,
          original_value,
          suggested_value,
          reason,
          status,
          approval_count,
          rejection_count,
          created_at,
          resolved_at,
          profiles!inner(is_public)
        `)
        .eq('climb_id', climbId)
        .eq('profiles.is_public', true)
        .order('created_at', { ascending: false }),
    ])

    const { data: climb, error: climbError } = climbResult
    const { count: verificationCount } = verificationResult
    const { data: gradeVotes } = gradeVotesResult
    const { data: corrections } = correctionsResult

    if (climbError || !climb) {
      return NextResponse.json(
        { error: 'Climb not found' },
        { status: 404 }
      )
    }

    // Batch 3: user-specific queries (only when authenticated)
    let userHasVerified = false
    let userGradeVote: string | null = null
    if (userId) {
      const [verificationResult, gradeResult] = await Promise.all([
        supabase.from('climb_verifications').select('id').eq('climb_id', climbId).eq('user_id', userId).maybeSingle(),
        supabase.from('grade_votes').select('grade').eq('climb_id', effectiveClimbId).eq('user_id', userId).maybeSingle(),
      ])
      userHasVerified = !!verificationResult.data
      userGradeVote = gradeResult.data?.grade || null
    }

    const gradeDistribution = gradeVotes?.reduce((acc: Record<string, number>, vote) => {
      const grade = vote.grade
      acc[grade] = (acc[grade] || 0) + 1
      return acc
    }, {}) || {}

    const gradeVoteArray = Object.entries(gradeDistribution)
      .map(([grade, count]) => ({ grade, vote_count: count as number }))
      .sort((a, b) => b.vote_count - a.vote_count)

    const userIsSubmitter = userId ? climb.user_id === userId : false
    const isVerified = (verificationCount || 0) >= 3

    const formattedCorrections = (corrections || []).map((c: Record<string, unknown>) => ({
      id: c.id,
      climb_id: c.climb_id,
      user_id: c.user_id,
      correction_type: c.correction_type,
      original_value: c.original_value,
      suggested_value: c.suggested_value,
      reason: c.reason,
      status: c.status,
      approval_count: c.approval_count,
      rejection_count: c.rejection_count,
      created_at: c.created_at,
      resolved_at: c.resolved_at,
      user: { id: c.user_id as string, email: '' }
    }))

    const pendingCorrections = (formattedCorrections as ClimbCorrection[]).filter(
      c => c.status === 'pending'
    ).length

    return NextResponse.json({
      id: climb.id,
      name: climb.name,
      grade: climb.grade,
      status: climb.status,
      user_id: climb.user_id,
      is_verified: isVerified,
      verification_count: verificationCount || 0,
      user_has_verified: userHasVerified,
      user_is_submitter: userIsSubmitter,
      grade_votes: gradeVoteArray,
      user_grade_vote: userGradeVote,
      corrections: formattedCorrections,
      corrections_count: (formattedCorrections as ClimbCorrection[]).length,
      pending_corrections: pendingCorrections
    })
  } catch (error) {
    return createErrorResponse(error, 'Get climb status error')
  }
}

// Type for ClimbCorrection with user
interface ClimbCorrection {
  id: string
  climb_id: string
  user_id: string
  correction_type: string
  original_value: Record<string, unknown> | null
  suggested_value: Record<string, unknown>
  reason: string | null
  status: string
  approval_count: number
  rejection_count: number
  created_at: string
  resolved_at: string | null
  user: { id: string; email: string } | null
}
