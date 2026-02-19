import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createErrorResponse } from '@/lib/errors'

type PlaceTypeFilter = 'all' | 'crag' | 'gym'

export const revalidate = 30

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

  const { searchParams } = new URL(request.url)
  const query = searchParams.get('q')?.toLowerCase() || ''
  const latParam = searchParams.get('lat')
  const lngParam = searchParams.get('lng')
  const rawType = searchParams.get('type')?.toLowerCase() || 'all'
  const typeFilter: PlaceTypeFilter = rawType === 'crag' || rawType === 'gym' ? rawType : 'all'

  if (!query || query.length < 2) {
    return NextResponse.json([], {
      headers: {
        'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=300',
      },
    })
  }

  const hasLocation = latParam && lngParam
  const latitude = hasLocation ? parseFloat(latParam!) : null
  const longitude = hasLocation ? parseFloat(lngParam!) : null

  try {
    let select = supabase
      .from('places')
      .select('id,name,type,latitude,longitude,primary_discipline,disciplines')

    if (typeFilter !== 'all') {
      select = select.eq('type', typeFilter)
    }

    if (hasLocation && latitude !== null && longitude !== null) {
      const latRange = 0.1
      const lngRange = 0.1
      select = select
        .gte('latitude', latitude - latRange)
        .lte('latitude', latitude + latRange)
        .gte('longitude', longitude - lngRange)
        .lte('longitude', longitude + lngRange)
    }

    const { data: nearbyPlaces, error: nearbyError } = await select
      .ilike('name', `%${query}%`)
      .limit(50)

    if (nearbyError) {
      return createErrorResponse(nearbyError, 'Supabase error')
    }

    let results = nearbyPlaces || []

    if (hasLocation && latitude !== null && longitude !== null && results.length > 0) {
      results = results.map(place => {
        const distance = place.latitude && place.longitude
          ? calculateDistance(latitude, longitude, place.latitude, place.longitude)
          : null
        return { ...place, distance }
      }).sort((a, b) => {
        if (a.distance === null) return 1
        if (b.distance === null) return -1
        return a.distance - b.distance
      }).slice(0, 30)
    } else {
      results = results.slice(0, 30)
    }

    return NextResponse.json(results, {
      headers: {
        'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=300',
      },
    })
  } catch (error) {
    return createErrorResponse(error, 'Error searching places')
  }
}

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return Math.round(R * c)
}

function toRad(deg: number): number {
  return deg * (Math.PI / 180)
}
