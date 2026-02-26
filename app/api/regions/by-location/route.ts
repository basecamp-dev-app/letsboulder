import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { sanitizeError } from '@/lib/errors'

export const runtime = 'edge'

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
    const latParam = searchParams.get('lat')
    const lngParam = searchParams.get('lng')

    if (latParam === null || lngParam === null) {
      return NextResponse.json(
        { error: 'Valid lat and lng are required' },
        { status: 400 }
      )
    }

    const lat = latParam.trim().length > 0 ? Number(latParam) : Number.NaN
    const lng = lngParam.trim().length > 0 ? Number(lngParam) : Number.NaN

    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      lat < -90 ||
      lat > 90 ||
      lng < -180 ||
      lng > 180
    ) {
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
    sanitizeError(error, 'Region by location error')
    return NextResponse.json(null, { status: 200 })
  }
}
