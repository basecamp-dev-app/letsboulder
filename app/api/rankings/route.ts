import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { getGradePoints, getGradeFromPoints, FLASH_BONUS } from '@/lib/grades'
import { createErrorResponse } from '@/lib/errors'
import type { Profile } from '@/types/database'

export const revalidate = 60

interface UserClimbQueryResult {
  id: string
  user_id: string
  created_at: string
  style: 'top' | 'flash'
  climbs: {
    id: string
    grade: string
  }
}

interface RegionRouteLine {
  climb_id: string
  images: {
    crags: {
      regions: {
        id: string
      }
    }
  } | null
}

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
      return createErrorResponse(error, 'Query error')
    }

    let filteredClimbs = userClimbs as unknown as UserClimbQueryResult[] | null
    
    if (!filteredClimbs) {
      filteredClimbs = []
    }
    
    if (regionParam) {
      const climbIds = [...new Set(filteredClimbs.map((uc) => uc.climbs?.id).filter(Boolean) || [])]
      if (climbIds.length > 0) {
        const { data: routeLinesData } = await supabase
          .from('route_lines')
          .select('climb_id, images!inner(crags!inner(regions!inner(id, name))))')
          .in('climb_id', climbIds)

        const regionClimbIds = new Set<string>()
        if (routeLinesData) {
          for (const rl of routeLinesData) {
            if ('climb_id' in rl && 'images' in rl) {
              const routeLine = rl as unknown as RegionRouteLine
              if (routeLine.climb_id && routeLine.images?.crags?.regions?.id === regionParam) {
                regionClimbIds.add(routeLine.climb_id)
              }
            }
          }
        }
        filteredClimbs = filteredClimbs.filter((uc) => uc.climbs && regionClimbIds.has(uc.climbs.id))
      }
    }

    const userClimbsMap: Record<string, UserClimbQueryResult[]> = {}
    filteredClimbs.forEach((uc) => {
      if (!userClimbsMap[uc.user_id]) {
        userClimbsMap[uc.user_id] = []
      }
      userClimbsMap[uc.user_id].push(uc)
    })

    const userIds = Object.keys(userClimbsMap)

    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, username, first_name, last_name, display_name, avatar_url, gender, is_public')
      .eq('is_public', true)
      .in('id', userIds)

    const profilesMap = new Map(profiles?.map(p => [p.id, p]) || [])

    const publicUserIds = userIds.filter(userId => profilesMap.has(userId))

    const getUsername = (userId: string, profile: Profile | undefined): string => {
      if (profile?.first_name && profile?.last_name) {
        return `${profile.first_name} ${profile.last_name}`
      }
      if (profile?.display_name) {
        return profile.display_name
      }
      return `Climber ${userId.slice(0, 4)}`
    }

    const leaderboard = publicUserIds.map(userId => {
      const userClimbsArr = userClimbsMap[userId] || []
      const climbCount = userClimbsArr.length

      let totalPoints = 0
      let validClimbCount = 0
      userClimbsArr.forEach((uc) => {
        const climb = uc.climbs
        const basePoints = getGradePoints(climb?.grade)
        if (basePoints > 0) {
          const points = uc.style === 'flash' ? basePoints + FLASH_BONUS : basePoints
          totalPoints += points
          validClimbCount++
        }
      })
      const avgPoints = validClimbCount > 0 ? Math.round(totalPoints / validClimbCount) : 0

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

    const publicTotalUsers = publicUserIds.length
    const paginatedLeaderboard = leaderboard.slice(offset, offset + limit)

    return NextResponse.json({
      leaderboard: paginatedLeaderboard,
      pagination: {
        page,
        limit,
        total_users: publicTotalUsers,
        total_pages: Math.ceil(publicTotalUsers / limit),
      },
    }, {
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
      },
    })
  } catch (error) {
    return createErrorResponse(error, 'Rankings error')
  }
}
