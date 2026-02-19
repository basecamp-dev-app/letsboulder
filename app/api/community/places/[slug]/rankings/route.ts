import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createErrorResponse } from '@/lib/errors'
import { FLASH_BONUS, getGradeFromPoints, getGradePoints } from '@/lib/grades'

type RankingSort = 'grade' | 'tops'

interface RouteParams {
  slug: string
}

interface UserClimbRow {
  user_id: string
  style: 'top' | 'flash'
  created_at: string
  climbs: {
    id: string
    grade: string
    place_id: string | null
  } | Array<{
    id: string
    grade: string
    place_id: string | null
  }>
}

interface ProfileRow {
  id: string
  username: string | null
  display_name: string | null
  first_name: string | null
  last_name: string | null
  avatar_url: string | null
  is_public: boolean
}

function getDisplayName(userId: string, profile: ProfileRow | undefined): string {
  const fullName = `${profile?.first_name || ''} ${profile?.last_name || ''}`.trim()
  if (fullName) return fullName
  if (profile?.display_name) return profile.display_name
  if (profile?.username) return profile.username
  return `Climber ${userId.slice(0, 4)}`
}

function getClimbRecord(climbs: UserClimbRow['climbs']): { id: string; grade: string; place_id: string | null } | null {
  if (Array.isArray(climbs)) {
    return climbs[0] || null
  }
  return climbs || null
}

export async function GET(request: NextRequest, { params }: { params: Promise<RouteParams> }) {
  const { slug } = await params
  if (!slug) {
    return NextResponse.json({ error: 'Missing place slug' }, { status: 400 })
  }

  const searchParams = request.nextUrl.searchParams
  const sortParam = searchParams.get('sort') || 'tops'
  const sort: RankingSort = sortParam === 'grade' ? 'grade' : 'tops'
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10))
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20', 10)))
  const offset = (page - 1) * limit

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
    const { data: place } = await supabase
      .from('places')
      .select('id, name, slug')
      .eq('slug', slug)
      .limit(1)
      .maybeSingle()

    if (!place) {
      return NextResponse.json({ error: 'Place not found' }, { status: 404 })
    }

    const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString()

    const { data: climbRows, error: climbsError } = await supabase
      .from('user_climbs')
      .select('user_id, style, created_at, climbs!inner(id, grade, place_id)')
      .in('style', ['top', 'flash'])
      .gte('created_at', sixtyDaysAgo)
      .eq('climbs.place_id', place.id)

    if (climbsError) {
      return createErrorResponse(climbsError, 'Place rankings query error')
    }

    const userClimbs = (climbRows || []) as unknown as UserClimbRow[]
    const userIds = Array.from(new Set(userClimbs.map(row => row.user_id)))

    if (userIds.length === 0) {
      return NextResponse.json(
        {
          place: { id: place.id, name: place.name, slug: place.slug },
          leaderboard: [],
          pagination: { page, limit, total_users: 0, total_pages: 0 },
        },
        {
          headers: {
            'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
          },
        }
      )
    }

    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, username, display_name, first_name, last_name, avatar_url, is_public')
      .eq('is_public', true)
      .in('id', userIds)

    if (profilesError) {
      return createErrorResponse(profilesError, 'Place rankings profiles error')
    }

    const profileMap = new Map(((profiles || []) as ProfileRow[]).map(profile => [profile.id, profile]))
    const publicUserIds = userIds.filter(userId => profileMap.has(userId))

    const climbsByUser = new Map<string, UserClimbRow[]>()
    for (const row of userClimbs) {
      if (!profileMap.has(row.user_id)) continue
      const existing = climbsByUser.get(row.user_id)
      if (existing) {
        existing.push(row)
      } else {
        climbsByUser.set(row.user_id, [row])
      }
    }

    const leaderboard = publicUserIds
      .map(userId => {
        const rows = climbsByUser.get(userId) || []
        const climbCount = rows.length

        let totalPoints = 0
        let validClimbCount = 0

        for (const row of rows) {
          const climb = getClimbRecord(row.climbs)
          const basePoints = getGradePoints(climb?.grade)
          if (basePoints > 0) {
            totalPoints += row.style === 'flash' ? basePoints + FLASH_BONUS : basePoints
            validClimbCount += 1
          }
        }

        const avgPoints = validClimbCount > 0 ? Math.round(totalPoints / validClimbCount) : 0
        const avgGrade = getGradeFromPoints(avgPoints)
        const profile = profileMap.get(userId)

        return {
          rank: 0,
          user_id: userId,
          username: getDisplayName(userId, profile),
          avatar_url: profile?.avatar_url || null,
          avg_grade: avgGrade,
          climb_count: climbCount,
          sort_value: sort === 'tops' ? climbCount : avgPoints,
        }
      })
      .sort((a, b) => b.sort_value - a.sort_value)

    leaderboard.forEach((entry, index) => {
      entry.rank = index + 1
      delete (entry as { sort_value?: number }).sort_value
    })

    const totalUsers = leaderboard.length
    const paginated = leaderboard.slice(offset, offset + limit)

    return NextResponse.json(
      {
        place: { id: place.id, name: place.name, slug: place.slug },
        leaderboard: paginated,
        pagination: {
          page,
          limit,
          total_users: totalUsers,
          total_pages: Math.ceil(totalUsers / limit),
        },
      },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
        },
      }
    )
  } catch (error) {
    return createErrorResponse(error, 'Place rankings error')
  }
}
