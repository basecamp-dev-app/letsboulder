import { NextRequest, NextResponse } from 'next/server'
import { createErrorResponse } from '@/lib/errors'
import { getServerClientFromRequest } from '@/lib/supabase-server'

interface RouteParams {
  slug: string
}

export async function GET(request: NextRequest, { params }: { params: Promise<RouteParams> }) {
  const { slug } = await params
  if (!slug) {
    return NextResponse.json({ error: 'Missing place slug' }, { status: 400 })
  }

  const page = Math.max(1, parseInt(request.nextUrl.searchParams.get('page') || '1', 10))
  const limit = Math.min(100, Math.max(1, parseInt(request.nextUrl.searchParams.get('limit') || '20', 10)))
  const supabase = getServerClientFromRequest(request)

  try {
    const { data: place } = await supabase
      .from('places')
      .select('id, name, slug')
      .eq('slug', slug)
      .maybeSingle()

    if (!place) {
      return NextResponse.json({ error: 'Place not found' }, { status: 404 })
    }

    const { data: leaderboard, error } = await supabase.rpc('get_place_contributor_leaderboard', {
      p_place_id: place.id,
      p_page: page,
      p_limit: limit,
    })

    if (error) {
      return createErrorResponse(error, 'Place contributor leaderboard error')
    }

    const totalUsers = leaderboard?.[0]?.total_users || 0

    return NextResponse.json({
      place: { id: place.id, name: place.name, slug: place.slug },
      leaderboard: leaderboard || [],
      pagination: {
        page,
        limit,
        total_users: totalUsers,
        total_pages: Math.ceil(Number(totalUsers) / limit),
      },
    }, {
      headers: {
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    return createErrorResponse(error, 'Place contributor leaderboard error')
  }
}
