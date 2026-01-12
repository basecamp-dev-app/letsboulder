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
    const lat = parseFloat(searchParams.get('lat') || '0')
    const lng = parseFloat(searchParams.get('lng') || '0')

    if (!lat || !lng || isNaN(lat) || isNaN(lng)) {
      return NextResponse.json(
        { error: 'Valid lat and lng are required' },
        { status: 400 }
      )
    }

    const { data, error } = await supabase
      .rpc('find_region_by_location', {
        search_lat: lat,
        search_lng: lng
      })
      .select('id, name, country_code, center_lat, center_lon')
      .limit(1)
      .single()

    if (error || !data) {
      return NextResponse.json(null, { status: 200 })
    }

    return NextResponse.json({
      id: data.id,
      name: data.name,
      country_code: data.country_code,
      center_lat: data.center_lat,
      center_lon: data.center_lon
    })
  } catch (error) {
    console.error('Region by location error:', error)
    return NextResponse.json(null, { status: 200 })
  }
}
