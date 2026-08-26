import { NextRequest, NextResponse } from 'next/server'
import { createErrorResponse } from '@/lib/errors'
import { getServerClientFromRequest } from '@/lib/supabase-server'
import { loadCragRankingsLeaderboard } from '@/features/rankings/server/leaderboard'

type RankingSort = 'grade' | 'tops'
type RankingWindow = '60d' | 'all-time'

interface RouteParams {
  id: string
}

export async function GET(request: NextRequest, { params }: { params: Promise<RouteParams> }) {
  const { id } = await params
  if (!id) {
    return NextResponse.json({ error: 'Missing crag id' }, { status: 400 })
  }

  const searchParams = request.nextUrl.searchParams
  const sortParam = searchParams.get('sort') || 'tops'
  const sort: RankingSort = sortParam === 'grade' ? 'grade' : 'tops'
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10))
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20', 10)))

  const supabase = getServerClientFromRequest(request)

  try {
    const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString()

    let selectedWindow: RankingWindow = '60d'
    let fallbackUsed = false

    const windowResult = await loadCragRankingsLeaderboard(supabase, {
      cragId: id,
      sort,
      page,
      limit,
      windowStart: sixtyDaysAgo,
    })

    if (windowResult.error) {
      return createErrorResponse(windowResult.error, 'Crag rankings query error')
    }

    let leaderboard = windowResult.data?.leaderboard || []
    let totalUsers = windowResult.data?.totalUsers || 0

    if (leaderboard.length === 0) {
      fallbackUsed = true
      selectedWindow = 'all-time'

      const allTimeResult = await loadCragRankingsLeaderboard(supabase, {
        cragId: id,
        sort,
        page,
        limit,
        windowStart: null,
      })

      if (allTimeResult.error) {
        return createErrorResponse(allTimeResult.error, 'Crag rankings query error')
      }

      leaderboard = allTimeResult.data?.leaderboard || []
      totalUsers = allTimeResult.data?.totalUsers || 0
    }

    return NextResponse.json(
      {
        crag: { id },
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
    return createErrorResponse(error, 'Crag rankings error')
  }
}
