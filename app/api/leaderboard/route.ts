import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

export async function GET(request: NextRequest) {
  const cookies = request.cookies
  const searchParams = request.nextUrl.searchParams

  const gender = searchParams.get('gender')
  const region = searchParams.get('region')
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
    const regionParam = region === 'all' ? null : region

    const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString()

    const { data: logs, error } = await supabase
      .from('user_climbs')
      .select(`
        id,
        user_id,
        created_at,
        style,
        climbs(id, grade)
      `, { count: 'exact' })
      .eq('style', 'top')
      .gte('created_at', sixtyDaysAgo)

    if (error) {
      console.error('Query error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const climbIds = [...new Set(logs?.map((log: any) => log.climb_id) || [])]

    const climbToRegion: Record<string, { id: string; name: string }> = {}
    if (climbIds.length > 0) {
      const { data: routeLinesData } = await supabase
        .from('route_lines')
        .select('climb_id, images!inner(crags!inner(regions!inner(id, name))))')
        .in('climb_id', climbIds)

      if (routeLinesData) {
        routeLinesData.forEach((rl: any) => {
          if (rl.climb_id && rl.images?.crags?.regions) {
            climbToRegion[rl.climb_id] = {
              id: rl.images.crags.regions.id,
              name: rl.images.crags.regions.name
            }
          }
        })
      }
    }

    let filteredLogs = logs || []
    if (regionParam) {
      filteredLogs = filteredLogs.filter((log: any) => climbToRegion[log.climb_id]?.id === regionParam)
    }

    if (genderParam) {
      filteredLogs = filteredLogs.filter((log: any) => log.user_id === genderParam)
    }

    const totalUsers = new Set(filteredLogs.map((log: any) => log.user_id)).size

    const userLogs: Record<string, typeof filteredLogs> = {}
    filteredLogs.forEach((log: any) => {
      if (!userLogs[log.user_id]) {
        userLogs[log.user_id] = []
      }
      userLogs[log.user_id].push(log)
    })

    const userIds = Object.keys(userLogs)

    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, username, avatar_url, gender')
      .in('id', userIds)

    const profilesMap = new Map(profiles?.map(p => [p.id, p]) || [])

    const leaderboard = userIds.map(userId => {
      const userLogsArr = userLogs[userId] || []
      const climbCount = userLogsArr.length

      let totalPoints = 0
      userLogsArr.forEach((log: any) => {
        const climb = log.climbs as any
        if (climb && climb.grade) {
          totalPoints += getGradePoints(climb.grade)
        }
      })
      const avgPoints = climbCount > 0 ? Math.round(totalPoints / climbCount) : 0

      const profile = profilesMap.get(userId)
      return {
        rank: 0,
        user_id: userId,
        username: profile?.username || 'Unknown',
        avatar_url: profile?.avatar_url,
        avg_grade: getGradeFromPoints(avgPoints),
        climb_count: climbCount,
      }
    }).sort((a, b) => b.climb_count - a.climb_count)

    leaderboard.forEach((entry, index) => {
      entry.rank = index + 1
    })

    const paginatedLeaderboard = leaderboard.slice(offset, offset + limit)

    return NextResponse.json({
      leaderboard: paginatedLeaderboard,
      pagination: {
        page,
        limit,
        total_users: totalUsers,
        total_pages: Math.ceil(totalUsers / limit),
      },
    })
  } catch (error) {
    console.error('Leaderboard error:', error)
    return NextResponse.json({ error: 'Failed to fetch leaderboard' }, { status: 500 })
  }
}

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
