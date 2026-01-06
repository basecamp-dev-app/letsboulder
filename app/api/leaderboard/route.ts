import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

export async function GET(request: NextRequest) {
  const cookies = request.cookies
  const searchParams = request.nextUrl.searchParams
  
  const gender = searchParams.get('gender')
  const page = Math.max(1, parseInt(searchParams.get('page') || '1'))
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20')))
  const offset = (page - 1) * limit

  if (gender && gender !== 'all') {
    const allowedGenders = ['male', 'female', 'other', 'prefer_not_to_say']
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
    const genderParam = gender === 'all' ? null : gender === 'prefer_not_to_say' ? null : gender

    // Call the RPC function
    const { data: leaderboardData, error } = await supabase
      .rpc('get_leaderboard', {
        gender_filter: genderParam,
        limit_rows: limit,
        offset_rows: offset
      })

    if (error) {
      console.error('RPC error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Get total count for pagination
    const { count: totalUsers } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })

    // Transform data: map avg_points to avg_grade
    const leaderboard = leaderboardData?.map((entry: any, index: number) => ({
      rank: offset + index + 1,
      user_id: entry.user_id,
      username: entry.username,
      avatar_url: entry.avatar_url,
      avg_grade: entry.avg_points ? getGradeFromPoints(entry.avg_points) : '?',
      climb_count: entry.climb_count,
    })) || []

    return NextResponse.json({
      leaderboard,
      pagination: {
        page,
        limit,
        total_users: totalUsers || 0,
        total_pages: Math.ceil((totalUsers || 0) / limit),
      },
    })
  } catch (error) {
    console.error('Leaderboard error:', error)
    return NextResponse.json({ error: 'Failed to fetch leaderboard' }, { status: 500 })
  }
}

// Complete 1A–9C+ grade mapping
const gradePoints: Record<string, number> = {
  // 1A–3C+
  '1A': 100, '1A+': 116, '1B': 132, '1B+': 148, '1C': 164, '1C+': 180,
  // 2A–4C+
  '2A': 196, '2A+': 212, '2B': 228, '2B+': 244, '2C': 260, '2C+': 276,
  // 3A–5C+
  '3A': 292, '3A+': 308, '3B': 324, '3B+': 340, '3C': 356, '3C+': 372,
  // 4A–6C+
  '4A': 388, '4A+': 404, '4B': 420, '4B+': 436, '4C': 452, '4C+': 468,
  // 5A–6C+
  '5A': 484, '5A+': 500, '5B': 516, '5B+': 532, '5C': 548, '5C+': 564,
  // 6A–7C+
  '6A': 580, '6A+': 596, '6B': 612, '6B+': 628, '6C': 644, '6C+': 660,
  // 7A–8C+
  '7A': 676, '7A+': 692, '7B': 708, '7B+': 724, '7C': 740, '7C+': 756,
  // 8A–9C+
  '8A': 772, '8A+': 788, '8B': 804, '8B+': 820, '8C': 836, '8C+': 852,
  // 9A–9C+
  '9A': 868, '9A+': 884, '9B': 900, '9B+': 916, '9C': 932, '9C+': 948,
}

function getGradeFromPoints(points: number): string {
  let closest = '?'
  let minDiff = Infinity
  
  for (const [grade, gradePointsVal] of Object.entries(gradePoints)) {
    const diff = Math.abs(gradePointsVal - points)
    if (diff < minDiff) {
      minDiff = diff
      closest = grade
    }
  }
  
  return closest
}
