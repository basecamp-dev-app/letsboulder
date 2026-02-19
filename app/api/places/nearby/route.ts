import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createErrorResponse } from '@/lib/errors'

type PlaceTypeFilter = 'all' | 'crag' | 'gym'

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
  const latParam = searchParams.get('lat')
  const lngParam = searchParams.get('lng')
  const rawType = searchParams.get('type')?.toLowerCase() || 'all'
  const typeFilter: PlaceTypeFilter = rawType === 'crag' || rawType === 'gym' ? rawType : 'all'

  if (!latParam || !lngParam) {
    return NextResponse.json([], {
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=600',
      },
    })
  }

  const latitude = parseFloat(latParam)
  const longitude = parseFloat(lngParam)

  if (isNaN(latitude) || isNaN(longitude)) {
    return NextResponse.json([], {
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=600',
      },
    })
  }

  const latRange = 0.1
  const lngRange = 0.1

  try {
    let query = supabase
      .from('places')
      .select('id,name,type,latitude,longitude,rock_type,primary_discipline,disciplines')
      .gte('latitude', latitude - latRange)
      .lte('latitude', latitude + latRange)
      .gte('longitude', longitude - lngRange)
      .lte('longitude', longitude + lngRange)
      .order('name')
      .limit(50)

    if (typeFilter !== 'all') {
      query = query.eq('type', typeFilter)
    }

    const { data: places, error } = await query

    if (error) {
      return createErrorResponse(error, 'Supabase error')
    }

    if (!places || places.length === 0) {
      return NextResponse.json([], {
        headers: {
          'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=600',
        },
      })
    }

    const results = places
      .map(place => ({
        ...place,
        distance: place.latitude && place.longitude
          ? calculateDistance(latitude, longitude, place.latitude, place.longitude)
          : null
      }))
      .sort((a, b) => {
        if (a.distance === null) return 1
        if (b.distance === null) return -1
        return a.distance - b.distance
      })
      .slice(0, 30)

    return NextResponse.json(results, {
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=600',
      },
    })
  } catch (error) {
    return createErrorResponse(error, 'Error fetching nearby places')
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
