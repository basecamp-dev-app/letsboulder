import { NextRequest, NextResponse } from 'next/server'
import { createErrorResponse } from '@/lib/errors'
import { withApiMiddleware } from '@/lib/csrf-server'
import { resolveUserIdWithFallback } from '@/lib/auth-context'
import { GRADE_ORDER_INDEX, isValidGrade } from '@/lib/grade-constants'
import { loadGradeDistribution, upsertGradeVote } from '@/features/grades/lib/grade-votes'
import { getServerClientFromRequest } from '@/lib/supabase-server'
import { z } from 'zod'
import { parseWithSchema } from '@/lib/api-validation'
import { resolveEffectiveClimbId } from '@/features/climb/public-client'

const gradeVoteSchema = z.object({
  grade: z.string().min(1, 'Grade is required').refine(isValidGrade, 'Invalid grade'),
})

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: routeId } = await params

  const supabase = getServerClientFromRequest(request)
  
  const { userId } = await resolveUserIdWithFallback(request, supabase)
  
  try {
    const effectiveClimbId = await resolveEffectiveClimbId(supabase, routeId)
    if (!effectiveClimbId) return NextResponse.json({ error: 'Route not found' }, { status: 404 })

    const { data: routeData, error: routeError } = await supabase
      .from('climbs')
      .select('consensus_grade, total_votes')
      .eq('id', effectiveClimbId)
      .single()
    
    if (routeError && routeError.code !== 'PGRST116') {
      return createErrorResponse(routeError, 'Route fetch error')
    }
    
    let userVote = null
    if (userId) {
      const { data: userGrade } = await supabase
        .from('grade_votes')
        .select('grade')
        .eq('climb_id', effectiveClimbId)
        .eq('user_id', userId)
        .single()
      
      if (userGrade) {
        userVote = userGrade.grade
      }
    }
    
    const { distribution } = await loadGradeDistribution({
      supabase,
      entityId: effectiveClimbId,
    })

    const gradeDistribution = distribution
      .map(({ grade, vote_count }) => ({ grade, count: vote_count }))
      .sort((a, b) => {
        return (GRADE_ORDER_INDEX.get(a.grade) ?? 1e9) - (GRADE_ORDER_INDEX.get(b.grade) ?? 1e9)
      })
    
    return NextResponse.json({
      consensusGrade: routeData?.consensus_grade || null,
      voteCount: routeData?.total_votes || 0,
      userVote,
      distribution: gradeDistribution
    })
  } catch (error) {
    return createErrorResponse(error, 'Grades API error')
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const middlewareResult = await withApiMiddleware(request, {
    rateLimitKey: 'authenticatedWrite',
    unauthorizedMessage: 'Authentication required',
  })
  if (!middlewareResult.ok) return middlewareResult.response

  const { id: routeId } = await params

  const { supabase, userId } = middlewareResult
  
  try {
    const parsedBody = parseWithSchema(gradeVoteSchema, await request.json())
    if (!parsedBody.success) return parsedBody.response
    const { grade } = parsedBody.data
    const effectiveClimbId = await resolveEffectiveClimbId(supabase, routeId)
    if (!effectiveClimbId) return NextResponse.json({ error: 'Route not found' }, { status: 404 })
    
    const { error: upsertError } = await upsertGradeVote({
      supabase,
      entityId: effectiveClimbId,
      userId,
      grade,
    })
    
    if (upsertError) {
      return createErrorResponse(upsertError, 'Grade upsert error')
    }
    
    return NextResponse.json({ success: true, grade })
  } catch (error) {
    return createErrorResponse(error, 'Grade submission error')
  }
}
