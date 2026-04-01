import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { sanitizeError } from '@/lib/errors'

export const runtime = 'edge'

function normalizeRouteType(value: string | null | undefined): string | null {
  if (value === 'deep_water_solo') return 'deep-water-solo'
  if (value === 'sport' || value === 'boulder' || value === 'trad' || value === 'deep-water-solo') {
    return value
  }
  return null
}

function pickDominantRouteType(counts: Map<string, number>): string | null {
  return Array.from(counts.entries())
    .sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1]
      return a[0].localeCompare(b[0])
    })[0]?.[0] || null
}

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

    let nearbyCragDominantRouteType: string | null = null
    if (data?.crag?.id) {
      const { data: climbs } = await supabase
        .from('climbs')
        .select('route_type, status, deleted_at')
        .eq('crag_id', data.crag.id)

      const routeTypeCounts = new Map<string, number>()
      for (const climb of climbs || []) {
        if (climb.deleted_at) continue
        if (climb.status && climb.status !== 'approved') continue
        const normalizedType = normalizeRouteType(climb.route_type)
        if (!normalizedType) continue
        routeTypeCounts.set(normalizedType, (routeTypeCounts.get(normalizedType) || 0) + 1)
      }

      nearbyCragDominantRouteType = pickDominantRouteType(routeTypeCounts)
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
        dominantRouteType: nearbyCragDominantRouteType,
      } : null,
      error: null,
    })
  } catch (error) {
    sanitizeError(error, 'Region by location error')
    return NextResponse.json({ atlas: null, nearbyCrag: null, error: 'Failed to resolve location' }, { status: 200 })
  }
}
