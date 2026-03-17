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
      .rpc('get_upload_context', {
        search_lat: lat,
        search_lng: lng
      })

    if (error) {
      return NextResponse.json({ atlas: null, nearbyCrag: null, error: 'Failed to resolve location' }, { status: 200 })
    }

    return NextResponse.json({
      atlas: data?.country ? {
        continentName: data.continent?.name ?? data.un_region?.continent_name ?? null,
        unRegionName: data.un_region?.name ?? null,
        adminRegionName: data.region?.name ?? null,
        countryId: data.country?.id ?? null,
        countryCode: data.country?.iso_a2 ?? null,
        countryName: data.country?.name ?? null,
      } : null,
      nearbyCrag: data?.crag ? {
        id: data.crag.id,
        name: data.crag.name,
        distanceMeters: data.crag.distance_meters ?? null,
      } : null,
      error: null,
    })
  } catch (error) {
    sanitizeError(error, 'Region by location error')
    return NextResponse.json({ atlas: null, nearbyCrag: null, error: 'Failed to resolve location' }, { status: 200 })
  }
}
