import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { rateLimit, createRateLimitResponse } from '@/lib/rate-limit'
import { createErrorResponse } from '@/lib/errors'
import { withCsrfProtection } from '@/lib/csrf-server'
import { resolveUserIdWithFallback } from '@/lib/auth-context'
import { isValidGrade } from '@/lib/grade-constants'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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
    const { userId, authError } = await resolveUserIdWithFallback(request, supabase)

    if (authError || !userId) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      )
    }

    const rateLimitResult = rateLimit(request, 'authenticatedWrite', userId)
    const rateLimitResponse = createRateLimitResponse(rateLimitResult)
    if (!rateLimitResult.success) {
      return rateLimitResponse
    }

    const { id: climbId } = await params
    const body = await request.json()
    const { grade } = body

    if (typeof grade !== 'string' || !isValidGrade(grade)) {
      return NextResponse.json(
        { error: 'Invalid grade' },
        { status: 400 }
      )
    }

    // Check if climb exists
    const { data: climb, error: climbError } = await supabase
      .from('climbs')
      .select('id')
      .eq('id', climbId)
      .single()

    if (climbError || !climb) {
      return NextResponse.json(
        { error: 'Climb not found' },
        { status: 404 }
      )
    }

    // Upsert grade vote (insert or update)
    const { error: upsertError } = await supabase
      .from('grade_votes')
      .upsert({
        climb_id: climbId,
        user_id: userId,
        grade: grade
      }, {
        onConflict: 'climb_id, user_id'
      })

    if (upsertError) {
      return createErrorResponse(upsertError, 'Error saving grade vote')
    }

    // Get updated vote distribution
    const { data: gradeVotes } = await supabase
      .from('grade_votes')
      .select('grade')
      .eq('climb_id', climbId)

    const gradeDistribution = gradeVotes?.reduce((acc: Record<string, number>, vote) => {
      const g = vote.grade
      acc[g] = (acc[g] || 0) + 1
      return acc
    }, {}) || {}

    const gradeVoteArray = Object.entries(gradeDistribution)
      .map(([g, count]) => ({ grade: g, vote_count: count as number }))
      .sort((a, b) => b.vote_count - a.vote_count)

    // Get consensus grade (most voted)
    const consensusGrade = gradeVoteArray[0]?.grade || null

    return NextResponse.json({
      success: true,
      vote_count: gradeVotes?.length || 0,
      consensus_grade: consensusGrade,
      vote_distribution: gradeVoteArray,
      message: 'Grade vote recorded'
    })
  } catch (error) {
    return createErrorResponse(error, 'Grade vote error')
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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
    const { userId, authError } = await resolveUserIdWithFallback(request, supabase)

    if (authError || !userId) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      )
    }

    const rateLimitResult = rateLimit(request, 'authenticatedWrite', userId)
    const rateLimitResponse = createRateLimitResponse(rateLimitResult)
    if (!rateLimitResult.success) {
      return rateLimitResponse
    }

    const { id: climbId } = await params

    // Remove grade vote
    const { error: deleteError } = await supabase
      .from('grade_votes')
      .delete()
      .eq('climb_id', climbId)
      .eq('user_id', userId)

    if (deleteError) {
      return createErrorResponse(deleteError, 'Error removing grade vote')
    }

    return NextResponse.json({
      success: true,
      message: 'Grade vote removed'
    })
  } catch (error) {
    return createErrorResponse(error, 'Remove grade vote error')
  }
}
