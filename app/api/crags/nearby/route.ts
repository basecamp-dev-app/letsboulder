import { NextRequest, NextResponse } from 'next/server'
import { getServerClientFromRequest } from '@/lib/supabase-server'
import { createErrorResponse } from '@/lib/errors'
import { haversineMeters } from '@/lib/geo/haversine'

export async function GET(request: NextRequest) {
  const supabase = getServerClientFromRequest(request)

  const { searchParams } = new URL(request.url)
  const latParam = searchParams.get('lat')
  const lngParam = searchParams.get('lng')

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
    const { data: crags, error } = await supabase
      .from('crags')
      .select('id,name,latitude,longitude,rock_type,type,country_code,region_name,sub_area')
      .gte('latitude', latitude - latRange)
      .lte('latitude', latitude + latRange)
      .gte('longitude', longitude - lngRange)
      .lte('longitude', longitude + lngRange)
      .order('name')
      .limit(50)

    if (error) {
      return createErrorResponse(error, 'Supabase error')
    }

    if (!crags || crags.length === 0) {
      return NextResponse.json([], {
        headers: {
          'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=600',
        },
      })
    }

    const results = crags
      .map(crag => ({
        ...crag,
        countryName: getCountryName(crag.country_code),
        countryCode: crag.country_code,
        regionName: crag.region_name,
        subArea: crag.sub_area,
        distance: crag.latitude !== null && crag.longitude !== null
          ? Math.round(haversineMeters(latitude, longitude, crag.latitude, crag.longitude))
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
    return createErrorResponse(error, 'Error fetching nearby crags')
  }
}

function getCountryName(countryCode: string | null): string | null {
  if (!countryCode) return null

  try {
    const displayNames = new Intl.DisplayNames(['en'], { type: 'region' })
    return displayNames.of(countryCode.toUpperCase()) || null
  } catch {
    return countryCode.toUpperCase()
  }
}
