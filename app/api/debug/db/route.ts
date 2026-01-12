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
    // Check images
    const { data: images, error: imagesError } = await supabase
      .from('images')
      .select('id, url, latitude, longitude, created_at')
      .order('created_at', { ascending: false })
      .limit(10)

    if (imagesError) {
      return NextResponse.json({ error: imagesError.message }, { status: 500 })
    }

    // Check climbs
    const { data: climbs, error: climbsError } = await supabase
      .from('climbs')
      .select('id, name, status, user_id, created_at')
      .order('created_at', { ascending: false })
      .limit(10)

    if (climbsError) {
      return NextResponse.json({ error: climbsError.message }, { status: 500 })
    }

    // Check route_lines
    const { data: routeLines, error: rlError } = await supabase
      .from('route_lines')
      .select('id, image_id, climb_id, created_at')
      .order('created_at', { ascending: false })
      .limit(10)

    if (rlError) {
      return NextResponse.json({ error: rlError.message }, { status: 500 })
    }

    return NextResponse.json({
      images: images || [],
      climbs: climbs || [],
      routeLines: routeLines || [],
      counts: {
        images: images?.length || 0,
        climbs: climbs?.length || 0,
        routeLines: routeLines?.length || 0
      }
    })
  } catch (error) {
    console.error('Debug error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
