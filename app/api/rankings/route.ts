import { NextRequest, NextResponse } from 'next/server'
import { getServerClientFromRequest } from '@/lib/supabase-server'
import { createErrorResponse } from '@/lib/errors'
import { loadGlobalRankingsLeaderboard } from '@/features/rankings/server/leaderboard'

export const revalidate = 60

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams

  const gender = searchParams.get('gender')
  const region = searchParams.get('region')
  const sort = searchParams.get('sort') || 'grade'
  const page = Math.max(1, parseInt(searchParams.get('page') || '1'))
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20')))
  const offset = (page - 1) * limit

  if (gender && gender !== 'all') {
    const allowedGenders = ['male', 'female']
    if (!allowedGenders.includes(gender)) {
      return NextResponse.json({ error: 'Invalid gender filter' }, { status: 400 })
    }
  }

  if (sort !== 'grade' && sort !== 'tops') {
    return NextResponse.json({ error: 'Invalid sort parameter' }, { status: 400 })
  }

  const supabase = getServerClientFromRequest(request)

  try {
    const genderParam = gender === 'all' ? null : gender
    const regionParam = region === 'all' ? null : region
    const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString()

    const { data, error } = await loadGlobalRankingsLeaderboard(supabase, {
      gender: genderParam,
      regionId: regionParam,
      sort,
      page,
      limit,
      windowStart: sixtyDaysAgo,
    })

    if (error) {
      return createErrorResponse(error, 'Query error')
    }

    const leaderboard = data?.leaderboard || []
    const totalUsers = data?.totalUsers || 0

    return NextResponse.json({
      leaderboard,
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
    return createErrorResponse(error, 'Rankings error')
  }
}
