import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { getGradePoints, getGradeFromPoints, FLASH_BONUS } from '@/lib/grades'

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

    let query = supabase
      .from('logs')
      .select(`
        id,
        user_id,
        created_at,
        status,
        climbs!inner(id, grade)
      `, { count: 'exact' })
      .eq('status', 'top')
      .gte('created_at', sixtyDaysAgo)

    if (genderParam) {
      const { data: genderProfiles } = await supabase
        .from('profiles')
        .select('id')
        .eq('gender', genderParam)
      
      const genderUserIds = genderProfiles?.map(p => p.id) || []
      if (genderUserIds.length > 0) {
        query = query.in('user_id', genderUserIds)
      } else {
        return NextResponse.json({
          leaderboard: [],
          pagination: { page, limit, total_users: 0, total_pages: 0 },
        })
      }
    }

    const { data: logs, error } = await query

    if (error) {
      console.error('Query error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    let filteredLogs = logs || []
    
    if (regionParam) {
      const climbIds = [...new Set(filteredLogs.map((log: any) => log.climbs?.id).filter(Boolean) || [])]
      if (climbIds.length > 0) {
        const { data: routeLinesData } = await supabase
          .from('route_lines')
          .select('climb_id, images!inner(crags!inner(regions!inner(id, name))))')
          .in('climb_id', climbIds)

        const regionClimbIds = new Set<string>()
        routeLinesData?.forEach((rl: any) => {
          if (rl.climb_id && rl.images?.crags?.regions?.id === regionParam) {
            regionClimbIds.add(rl.climb_id)
          }
        })
        filteredLogs = filteredLogs.filter((log: any) => regionClimbIds.has(log.climbs?.id))
      }
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
        const climb = Array.isArray(log.climbs) ? log.climbs[0] : log.climbs
        if (climb && climb.grade) {
          const basePoints = getGradePoints(climb.grade)
          const points = log.status === 'flash' ? basePoints + FLASH_BONUS : basePoints
          totalPoints += points
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
