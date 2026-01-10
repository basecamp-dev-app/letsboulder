import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

export async function GET(request: NextRequest) {
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
    const { searchParams } = new URL(request.url)
    const cragId = searchParams.get('crag_id')
    const limit = parseInt(searchParams.get('limit') || '20')
    const offset = parseInt(searchParams.get('offset') || '0')

    if (!cragId) {
      return NextResponse.json(
        { error: 'crag_id is required' },
        { status: 400 }
      )
    }

    const { data, error } = await supabase
      .from('images')
      .select(`
        id,
        url,
        latitude,
        longitude,
        capture_date,
        width,
        height,
        created_at,
        route_lines(count)
      `)
      .eq('crag_id', cragId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (error) {
      console.error('Error fetching images:', error)
      return NextResponse.json(
        { error: 'Failed to fetch images' },
        { status: 500 }
      )
    }

    const formatted = (data || []).map(img => ({
      id: img.id,
      url: img.url,
      latitude: img.latitude,
      longitude: img.longitude,
      capture_date: img.capture_date,
      width: img.width,
      height: img.height,
      created_at: img.created_at,
      route_lines_count: Array.isArray(img.route_lines) && img.route_lines[0] ? (img.route_lines[0] as { count: number }).count : 0
    }))

    return NextResponse.json(formatted)
  } catch (error) {
    console.error('Images search API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
