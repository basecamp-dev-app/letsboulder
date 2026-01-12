import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

export async function GET() {
  const cookies = {
    getAll: () => [],
    setAll: () => {},
  }
  
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies }
  )

  try {
    // Get a recent image with route_lines and points
    const { data: routeLines, error } = await supabase
      .from('route_lines')
      .select(`
        id,
        image_id,
        points,
        color,
        climbs (
          id,
          name,
          grade,
          status
        )
      `)
      .order('created_at', { ascending: false })
      .limit(5)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Show sample of what points look like
    const sample = routeLines?.map(rl => ({
      id: rl.id,
      image_id: rl.image_id,
      points: rl.points,
      pointsType: typeof rl.points,
      pointsLength: Array.isArray(rl.points) ? rl.points.length : 'not array',
      climb: rl.climbs?.name
    }))

    return NextResponse.json({
      routeLines: sample,
      count: routeLines?.length || 0
    })
  } catch (error) {
    console.error('Debug error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
