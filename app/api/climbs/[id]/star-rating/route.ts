import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createErrorResponse } from '@/lib/errors'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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
    const { id: climbId } = await params

    const { data, error } = await supabase
      .rpc('get_star_rating_summary', { p_climb_id: climbId })
      .maybeSingle()

    if (error) {
      return createErrorResponse(error, 'Get star rating summary error')
    }

    const summary = (data || null) as { avg_rating: number | string | null; rating_count: number | null } | null

    const ratingCount = typeof summary?.rating_count === 'number' ? summary.rating_count : 0
    const ratingAvgRaw = summary?.avg_rating
    const ratingAvg = ratingAvgRaw === null || ratingAvgRaw === undefined ? null : Number(ratingAvgRaw)

    return NextResponse.json({
      rating_avg: ratingAvg,
      rating_count: ratingCount,
    })
  } catch (error) {
    return createErrorResponse(error, 'Get star rating route error')
  }
}
