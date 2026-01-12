import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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
    const { id: climbId } = await params

    // Get current user
    const { data: { user } } = await supabase.auth.getUser()

    // Get climb with verification info
    const { data: climb, error: climbError } = await supabase
      .from('climbs')
      .select('id, user_id, name, grade, status, created_at')
      .eq('id', climbId)
      .single()

    if (climbError || !climb) {
      return NextResponse.json(
        { error: 'Climb not found' },
        { status: 404 }
      )
    }

    // Get verification count
    const { count: verificationCount } = await supabase
      .from('climb_verifications')
      .select('id', { count: 'exact' })
      .eq('climb_id', climbId)

    // Check if user has verified
    let userHasVerified = false
    if (user) {
      const { data: userVerification } = await supabase
        .from('climb_verifications')
        .select('id')
        .eq('climb_id', climbId)
        .eq('user_id', user.id)
        .single()
      userHasVerified = !!userVerification
    }

    const userIsSubmitter = user ? climb.user_id === user.id : false
    const isVerified = (verificationCount || 0) >= 3

    // Get grade votes
    const { data: gradeVotes } = await supabase
      .from('grade_votes')
      .select('grade')
      .eq('climb_id', climbId)

    const gradeDistribution = gradeVotes?.reduce((acc: Record<string, number>, vote) => {
      const grade = vote.grade
      acc[grade] = (acc[grade] || 0) + 1
      return acc
    }, {}) || {}

    const gradeVoteArray = Object.entries(gradeDistribution)
      .map(([grade, count]) => ({ grade, vote_count: count as number }))
      .sort((a, b) => b.vote_count - a.vote_count)

    // Get user's grade vote
    let userGradeVote: string | null = null
    if (user) {
      const { data: userGrade } = await supabase
        .from('grade_votes')
        .select('grade')
        .eq('climb_id', climbId)
        .eq('user_id', user.id)
        .single()
      userGradeVote = userGrade?.grade || null
    }

    // Get corrections
    const { data: corrections } = await supabase
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
        profiles:user_id (id, email)
      `)
      .eq('climb_id', climbId)
      .order('created_at', { ascending: false })

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
      user: c.profiles ? { id: (c.profiles as { id: string }).id, email: '' } : null
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
    console.error('Get climb status error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
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
