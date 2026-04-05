import { NextRequest, NextResponse } from 'next/server'
import { getServerClientFromRequest } from '@/lib/supabase-server'
import { createErrorResponse } from '@/lib/errors'
import { haversineMeters } from '@/lib/geo/haversine'

type PlaceTypeFilter = 'all' | 'crag' | 'gym'

export async function GET(request: NextRequest) {
  const supabase = getServerClientFromRequest(request)

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
        distance: place.latitude !== null && place.longitude !== null
          ? Math.round(haversineMeters(latitude, longitude, place.latitude, place.longitude))
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
