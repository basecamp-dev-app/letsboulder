import { NextRequest, NextResponse } from 'next/server'
import { createErrorResponse } from '@/lib/errors'
import { getServerClientFromRequest } from '@/lib/supabase-server'

interface RouteParams {
  id: string
}

export async function GET(request: NextRequest, { params }: { params: Promise<RouteParams> }) {
  const { id } = await params
  if (!id) {
    return NextResponse.json({ error: 'Missing crag id' }, { status: 400 })
  }

  const page = Math.max(1, parseInt(request.nextUrl.searchParams.get('page') || '1', 10))
  const limit = Math.min(100, Math.max(1, parseInt(request.nextUrl.searchParams.get('limit') || '20', 10)))
  const supabase = getServerClientFromRequest(request)

  try {
    const { data: leaderboard, error } = await supabase.rpc('get_crag_contributor_leaderboard', {
      p_crag_id: id,
      p_page: page,
      p_limit: limit,
    })

    if (error) {
      return createErrorResponse(error, 'Crag contributor leaderboard error')
    }

    const totalUsers = leaderboard?.[0]?.total_users || 0

    return NextResponse.json({
      crag: { id },
      leaderboard: leaderboard || [],
      pagination: {
        page,
        limit,
        total_users: totalUsers,
        total_pages: Math.ceil(Number(totalUsers) / limit),
      },
    }, {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600',
      },
    })
  } catch (error) {
    return createErrorResponse(error, 'Crag contributor leaderboard error')
  }
}
