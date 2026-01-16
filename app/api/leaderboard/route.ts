import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { getGradePoints, getGradeFromPoints, FLASH_BONUS } from '@/lib/grades'

export const revalidate = 60

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
      .from('user_climbs')
      .select(`
        id,
        user_id,
        created_at,
        style,
        climbs!inner(id, grade)
      `, { count: 'exact' })
      .in('style', ['top', 'flash'])
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

    const { data: userClimbs, error } = await query

    if (error) {
      console.error('Query error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    let filteredClimbs = userClimbs || []
    
    if (regionParam) {
      const climbIds = [...new Set(filteredClimbs.map((uc: any) => uc.climbs?.id).filter(Boolean) || [])]
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
        filteredClimbs = filteredClimbs.filter((uc: any) => regionClimbIds.has(uc.climbs?.id))
      }
    }

    const totalUsers = new Set(filteredClimbs.map((uc: any) => uc.user_id)).size

    const userClimbsMap: Record<string, typeof filteredClimbs> = {}
    filteredClimbs.forEach((uc: any) => {
      if (!userClimbsMap[uc.user_id]) {
        userClimbsMap[uc.user_id] = []
      }
      userClimbsMap[uc.user_id].push(uc)
    })

    const userIds = Object.keys(userClimbsMap)

    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, username, first_name, last_name, display_name, avatar_url, gender')
      .in('id', userIds)

    const profilesMap = new Map(profiles?.map(p => [p.id, p]) || [])

    const getUsername = (userId: string, profile: any): string => {
      if (profile?.first_name && profile?.last_name) {
        return `${profile.first_name} ${profile.last_name}`
      }
      if (profile?.display_name) {
        return profile.display_name
      }
      return `Climber ${userId.slice(0, 4)}`
    }

    const leaderboard = userIds.map(userId => {
      const userClimbsArr = userClimbsMap[userId] || []
      const climbCount = userClimbsArr.length

      let totalPoints = 0
      userClimbsArr.forEach((uc: any) => {
        const climb = Array.isArray(uc.climbs) ? uc.climbs[0] : uc.climbs
        if (climb && climb.grade) {
          const basePoints = getGradePoints(climb.grade)
          const points = uc.style === 'flash' ? basePoints + FLASH_BONUS : basePoints
          totalPoints += points
        }
      })
      const avgPoints = climbCount > 0 ? Math.round(totalPoints / climbCount) : 0

      const profile = profilesMap.get(userId)
      return {
        rank: 0,
        user_id: userId,
        username: getUsername(userId, profile),
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
    }, {
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
      },
    })
  } catch (error) {
    console.error('Leaderboard error:', error)
    return NextResponse.json({ error: 'Failed to fetch leaderboard' }, { status: 500 })
  }
}
