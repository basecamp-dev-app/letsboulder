import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

export async function GET(request: NextRequest) {
  const cookies = request.cookies
  const searchParams = request.nextUrl.searchParams
  
  const gender = searchParams.get('gender')
  const country = searchParams.get('country')
  const page = Math.max(1, parseInt(searchParams.get('page') || '1'))
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20')))
  const offset = (page - 1) * limit

  if (gender && gender !== 'all') {
    const allowedGenders = ['male', 'female']
    if (!allowedGenders.includes(gender)) {
      return NextResponse.json({ error: 'Invalid gender filter' }, { status: 400 })
    }
  }

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
    const genderParam = gender === 'all' ? null : gender

    // Build the query with optional country filter
    let query = supabase
      .from('user_climbs')
      .select(`
        user_id,
        created_at,
        style,
        climbs!inner(
          grade,
          crags!inner(country)
        )
      `, { count: 'exact' })
      .eq('style', 'top')
      .gte('created_at', new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString())

    // Apply country filter if not 'all'
    if (country && country !== 'all') {
      query = query.eq('climbs.crags.country', country)
    }

    // Apply gender filter
    if (genderParam) {
      query = query.eq('user_id', genderParam)
    }

    const { data: logs, error, count } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (error) {
      console.error('Query error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Get unique users from logs
    const userIds = [...new Set(logs?.map(log => log.user_id) || [])]
    
    // Get user profiles
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, username, avatar_url, gender')
      .in('id', userIds)

    // Calculate leaderboard entries
    const userLogs: Record<string, typeof logs> = {}
    logs?.forEach(log => {
      if (!userLogs[log.user_id]) {
        userLogs[log.user_id] = []
      }
      userLogs[log.user_id].push(log)
    })

    const leaderboard = profiles?.map(profile => {
      const userLogsArr = userLogs[profile.id] || []
      const climbCount = userLogsArr.length

      // Calculate average grade
      let totalPoints = 0
      userLogsArr.forEach(log => {
        const climb = log.climbs as any
        if (climb && climb.grade) {
          totalPoints += getGradePoints(climb.grade)
        }
      })
      const avgPoints = climbCount > 0 ? Math.round(totalPoints / climbCount) : 0

      return {
        rank: 0,
        user_id: profile.id,
        username: profile.username,
        avatar_url: profile.avatar_url,
        avg_grade: getGradeFromPoints(avgPoints),
        climb_count: climbCount,
      }
    }).sort((a, b) => b.climb_count - a.climb_count) || []

    // Assign ranks
    leaderboard.forEach((entry, index) => {
      entry.rank = index + 1
    })

    return NextResponse.json({
      leaderboard,
      pagination: {
        page,
        limit,
        total_users: count || 0,
        total_pages: Math.ceil((count || 0) / limit),
      },
    })
  } catch (error) {
    console.error('Leaderboard error:', error)
    return NextResponse.json({ error: 'Failed to fetch leaderboard' }, { status: 500 })
  }
}

// Complete grade mapping
const gradePoints: Record<string, number> = {
  'V0': 580, 'V1': 596, 'V2': 612, 'V3': 628, 'V4': 644, 'V5': 660,
  'V6': 676, 'V7': 692, 'V8': 708, 'V9': 724, 'V10': 740,
}

function getGradePoints(grade: string): number {
  return gradePoints[grade] || 600
}

function getGradeFromPoints(points: number): string {
  let closest = '?'
  let minDiff = Infinity
  
  for (const [grade, gradePointsVal] of Object.entries(gradePoints)) {
    const diff = Math.abs(gradePointsVal - points)
    if (diff < minDiff) {
      minDiff = diff
      closest = grade
    }
  }
  
  return closest
}
