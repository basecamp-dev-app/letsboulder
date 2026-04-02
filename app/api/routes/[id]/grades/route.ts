import { NextRequest, NextResponse } from 'next/server'
import { getServerClientFromRequest } from '@/lib/supabase-server'
import { createErrorResponse } from '@/lib/errors'
import { withCsrfProtection } from '@/lib/csrf-server'
import { rateLimit, createRateLimitResponse } from '@/lib/rate-limit'
import { resolveUserIdWithFallback } from '@/lib/auth-context'
import { GRADE_ORDER_INDEX, isValidGrade } from '@/lib/grade-constants'

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
    
    const { data: distribution } = await supabase
      .from('route_grades')
      .select('grade')
      .eq('route_id', routeId)
    
    const gradeCounts: Record<string, number> = {}
    distribution?.forEach(({ grade }) => {
      gradeCounts[grade] = (gradeCounts[grade] || 0) + 1
    })
    
    const gradeDistribution = Object.entries(gradeCounts)
      .map(([grade, count]) => ({ grade, count }))
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
  const csrfResult = await withCsrfProtection(request)
  if (!csrfResult.valid) return csrfResult.response!

  const { id: routeId } = await params

  const supabase = getServerClientFromRequest(request)
  
  const { userId, authError } = await resolveUserIdWithFallback(request, supabase)
  
  if (authError || !userId) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }

  const rateLimitResult = rateLimit(request, 'authenticatedWrite', userId)
  const rateLimitResponse = createRateLimitResponse(rateLimitResult)
  if (!rateLimitResult.success) {
    return rateLimitResponse
  }
  
  try {
    const body = await request.json()
    const { grade } = body
    
    if (!grade) {
      return NextResponse.json({ error: 'Grade is required' }, { status: 400 })
    }
    
    if (typeof grade !== 'string' || !isValidGrade(grade)) {
      return NextResponse.json({ error: 'Invalid grade' }, { status: 400 })
    }
    
    const { error: upsertError } = await supabase
      .from('route_grades')
      .upsert({
        route_id: routeId,
        user_id: userId,
        grade
      }, {
        onConflict: 'route_id,user_id'
      })
    
    if (upsertError) {
      return createErrorResponse(upsertError, 'Grade upsert error')
    }
    
    return NextResponse.json({ success: true, grade })
  } catch (error) {
    return createErrorResponse(error, 'Grade submission error')
  }
}
