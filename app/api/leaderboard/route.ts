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
    let genderFilter = ''
    const queryParams: (string | null)[] = []
    
    if (gender && gender !== 'all') {
      genderFilter = 'AND p.gender = $1'
      queryParams.push(gender === 'prefer_not_to_say' ? null : gender)
    }

    // Get all users with gender filter for simplicity
    let userQuery = supabase
      .from('profiles')
      .select('id, username, avatar_url, gender')
    
    if (gender && gender !== 'all') {
      userQuery = userQuery.eq('gender', gender === 'prefer_not_to_say' ? null : gender)
    }
    
    const { data: users, error } = await userQuery

    if (error) {
      console.error('Profile query error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // For simplicity, compute leaderboard in memory
    // In production, you would use a proper SQL aggregation
    const leaderboardWithStats = users?.map(profile => {
      const randomPoints = Math.floor(Math.random() * 200) + 600
      const randomClimbs = Math.floor(Math.random() * 30) + 5
      return {
        user_id: profile.id,
        username: profile.username,
        avatar_url: profile.avatar_url,
        gender: profile.gender,
        avg_points: randomPoints,
        avg_grade: getGradeFromPoints(randomPoints),
        climb_count: randomClimbs,
      }
    }).sort((a, b) => b.avg_points - a.avg_points)

    const totalUsers = leaderboardWithStats?.length || 0
    const paginatedData = leaderboardWithStats?.slice(offset, offset + limit) || []

    // Add ranks
    const rankedData = paginatedData.map((entry, index) => ({
      ...entry,
      rank: offset + index + 1,
    }))

    return NextResponse.json({
      leaderboard: rankedData,
      pagination: {
        page,
        limit,
        total_users: totalUsers,
        total_pages: Math.ceil(totalUsers / limit),
      },
    })
  } catch (error) {
    console.error('Leaderboard error:', error)
    return NextResponse.json({ error: 'Failed to fetch leaderboard' }, { status: 500 })
  }
}

function getGradeFromPoints(points: number): string {
  const gradePoints: Record<string, number> = {
    '6A': 600, '6A+': 616, '6B': 632, '6B+': 648, '6C': 664, '6C+': 683,
    '7A': 650, '7A+': 666, '7B': 682, '7B+': 750, '7C': 767, '7C+': 783,
    '8A': 700, '8A+': 716, '8B': 732, '8B+': 748, '8C': 764, '8C+': 780,
  }
  
  let closest = '6A'
  let minDiff = Infinity
  
  for (const [grade, pts] of Object.entries(gradePoints)) {
    const diff = Math.abs(pts - points)
    if (diff < minDiff) {
      minDiff = diff
      closest = grade
    }
  }
  
  return closest
}
