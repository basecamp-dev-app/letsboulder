import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createErrorResponse } from '@/lib/errors'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: routeId } = await params
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
  
  const { data: { user } } = await supabase.auth.getUser()
  
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
    if (user) {
      const { data: userGrade } = await supabase
        .from('route_grades')
        .select('grade')
        .eq('route_id', routeId)
        .eq('user_id', user.id)
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
        const gradeOrder = [
          '5A', '5A+', '5B', '5B+', '5C', '5C+',
          '6A', '6A+', '6B', '6B+', '6C', '6C+',
          '7A', '7A+', '7B', '7B+', '7C', '7C+',
          '8A', '8A+', '8B', '8B+', '8C', '8C+',
          '9A', '9A+', '9B', '9B+', '9C', '9C+'
        ]
        return gradeOrder.indexOf(a.grade) - gradeOrder.indexOf(b.grade)
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
  const { id: routeId } = await params
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
  
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  
  if (authError || !user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }
  
  try {
    const body = await request.json()
    const { grade } = body
    
    if (!grade) {
      return NextResponse.json({ error: 'Grade is required' }, { status: 400 })
    }
    
    const validGrades = [
      '5A', '5A+', '5B', '5B+', '5C', '5C+',
      '6A', '6A+', '6B', '6B+', '6C', '6C+',
      '7A', '7A+', '7B', '7B+', '7C', '7C+',
      '8A', '8A+', '8B', '8B+', '8C', '8C+',
      '9A', '9A+', '9B', '9B+', '9C', '9C+'
    ]
    
    if (!validGrades.includes(grade)) {
      return NextResponse.json({ error: 'Invalid grade' }, { status: 400 })
    }
    
    const { error: upsertError } = await supabase
      .from('route_grades')
      .upsert({
        route_id: routeId,
        user_id: user.id,
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
