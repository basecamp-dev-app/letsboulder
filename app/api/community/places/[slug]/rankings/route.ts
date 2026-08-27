import { NextRequest, NextResponse } from 'next/server'
import { getUnauthenticatedClient } from '@/lib/supabase-server'
import { createErrorResponse } from '@/lib/errors'
import { loadPlaceRankingsLeaderboard } from '@/features/rankings/server/leaderboard'

type RankingSort = 'grade' | 'tops'
type RankingWindow = '60d' | 'all-time'

interface RouteParams {
  slug: string
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

  const supabase = getUnauthenticatedClient()

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

    let selectedWindow: RankingWindow = '60d'
    let fallbackUsed = false

    const windowResult = await loadPlaceRankingsLeaderboard(supabase, {
      placeId: place.id,
      sort,
      page,
      limit,
      windowStart: sixtyDaysAgo,
    })

    if (windowResult.error) {
      return createErrorResponse(windowResult.error, 'Place rankings query error')
    }

    let leaderboard = windowResult.data?.leaderboard || []
    let totalUsers = windowResult.data?.totalUsers || 0

    if (leaderboard.length === 0) {
      fallbackUsed = true
      selectedWindow = 'all-time'
      const allTimeResult = await loadPlaceRankingsLeaderboard(supabase, {
        placeId: place.id,
        sort,
        page,
        limit,
        windowStart: null,
      })

      if (allTimeResult.error) {
        return createErrorResponse(allTimeResult.error, 'Place rankings query error')
      }

      leaderboard = allTimeResult.data?.leaderboard || []
      totalUsers = allTimeResult.data?.totalUsers || 0
    }

    return NextResponse.json(
      {
        place: { id: place.id, name: place.name, slug: place.slug },
        leaderboard,
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
          'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600',
        },
      }
    )
  } catch (error) {
    return createErrorResponse(error, 'Place rankings error')
  }
}
