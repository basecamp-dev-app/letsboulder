import { NextRequest, NextResponse } from 'next/server'
import { getServerClientFromRequest } from '@/lib/supabase-server'
import { createErrorResponse } from '@/lib/errors'
import { FLASH_BONUS, getGradeFromPoints, getGradePoints } from '@/lib/grades'
import { loadPlaceUserClimbs, enrichPlaceClimbsWithProfiles, type PlaceClimbRow } from '@/features/community/server/load-place-climb-data'
import { getClimbRecord } from '@/lib/profile-helpers'

type RankingSort = 'grade' | 'tops'
type RankingWindow = '60d' | 'all-time'

interface RouteParams {
  slug: string
}

interface LeaderboardEntry {
  rank: number
  user_id: string
  username: string
  avatar_url: string | null
  avg_grade: string
  climb_count: number
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

  const supabase = getServerClientFromRequest(request)

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

    async function fetchClimbs(windowStart: string | null): Promise<PlaceClimbRow[]> {
      return loadPlaceUserClimbs(supabase, place!.id, { windowStart })
    }

    async function buildLeaderboard(userClimbs: PlaceClimbRow[]): Promise<LeaderboardEntry[]> {
      const enriched = await enrichPlaceClimbsWithProfiles(supabase, userClimbs)
      if (enriched.length === 0) return []

      const profileMap = new Map(
        enriched.map((e) => [e.user_id, e.profile])
      )

      const climbsByUser = new Map<string, PlaceClimbRow[]>()
      for (const row of userClimbs) {
        if (!profileMap.has(row.user_id)) continue
        const existing = climbsByUser.get(row.user_id)
        if (existing) {
          existing.push(row)
        } else {
          climbsByUser.set(row.user_id, [row])
        }
      }

      const withSortValue = Array.from(profileMap.entries())
        .map(([userId, profile]) => {
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

          return {
            rank: 0,
            user_id: userId,
            username: profile.display_name,
            avatar_url: profile.avatar_url,
            avg_grade: avgGrade,
            climb_count: climbCount,
            sort_value: sort === 'tops' ? climbCount : avgPoints,
          }
        })
        .sort((a, b) => b.sort_value - a.sort_value)

      return withSortValue.map((entry, index) => ({
        rank: index + 1,
        user_id: entry.user_id,
        username: entry.username,
        avatar_url: entry.avatar_url,
        avg_grade: entry.avg_grade,
        climb_count: entry.climb_count,
      }))
    }

    let selectedWindow: RankingWindow = '60d'
    let fallbackUsed = false

    const windowClimbs = await fetchClimbs(sixtyDaysAgo)
    let leaderboard = await buildLeaderboard(windowClimbs)

    if (leaderboard.length === 0) {
      fallbackUsed = true
      selectedWindow = 'all-time'
      const allTimeClimbs = await fetchClimbs(null)
      leaderboard = await buildLeaderboard(allTimeClimbs)
    }

    const totalUsers = leaderboard.length
    const paginated = leaderboard.slice(offset, offset + limit)

    return NextResponse.json(
      {
        place: { id: place.id, name: place.name, slug: place.slug },
        leaderboard: paginated,
        window: selectedWindow,
        fallback_used: fallbackUsed,
        pagination: {
          page,
          limit,
          total_users: totalUsers,
          total_pages: Math.ceil(totalUsers / limit),
        },
      },
      {
        headers: {
          'Cache-Control': 'no-store',
        },
      }
    )
  } catch (error) {
    return createErrorResponse(error, 'Place rankings error')
  }
}
