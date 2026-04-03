import { NextRequest, NextResponse } from 'next/server'
import { createErrorResponse } from '@/lib/errors'
import { withApiMiddleware } from '@/lib/csrf-server'
import { resolveUserIdWithFallback } from '@/lib/auth-context'
import { GRADE_ORDER_INDEX, isValidGrade } from '@/lib/grade-constants'
import { loadGradeDistribution, upsertGradeVote } from '@/lib/grades/grade-votes'
import { getServerClientFromRequest } from '@/lib/supabase-server'
import { z } from 'zod'
import { parseWithSchema } from '@/lib/api-validation'

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
    const { data: routeData, error: routeError } = await supabase
      .from('climbs')
      .select('consensus_grade, vote_count')
      .eq('id', routeId)
      .single()
    
    if (routeError && routeError.code !== 'PGRST116') {
      return createErrorResponse(routeError, 'Route fetch error')
    }
    
    let userVote = null
    if (userId) {
      const { data: userGrade } = await supabase
        .from('route_grades')
        .select('grade')
        .eq('route_id', routeId)
        .eq('user_id', userId)
        .single()
      
      if (userGrade) {
        userVote = userGrade.grade
      }
    }
    
    const { distribution } = await loadGradeDistribution({
      supabase,
      table: 'route_grades',
      entityColumn: 'route_id',
      entityId: routeId,
    })

    const gradeDistribution = distribution
      .map(({ grade, vote_count }) => ({ grade, count: vote_count }))
      .sort((a, b) => {
        return (GRADE_ORDER_INDEX.get(a.grade) ?? 1e9) - (GRADE_ORDER_INDEX.get(b.grade) ?? 1e9)
      })
    
    return NextResponse.json({
      consensusGrade: routeData?.consensus_grade || null,
      voteCount: routeData?.vote_count || 0,
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
    
    const { error: upsertError } = await upsertGradeVote({
      supabase,
      table: 'route_grades',
      entityColumn: 'route_id',
      entityId: routeId,
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
