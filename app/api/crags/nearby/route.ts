import { NextRequest, NextResponse } from 'next/server'
import { getServerClientFromRequest } from '@/lib/supabase-server'
import { createErrorResponse } from '@/lib/errors'
import type { Database } from '@/types/database'

const DEFAULT_RADIUS_METERS = 10_000
const MAX_RADIUS_METERS = 100_000
const RESULT_LIMIT = 30

type NearbyCragRow = Database['public']['Functions']['get_nearby_crags']['Returns'][number]

function parseNumberParam(value: string | null): number {
  if (value === null || value.trim().length === 0) return Number.NaN
  return Number(value)
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const latitude = parseNumberParam(searchParams.get('lat'))
  const longitude = parseNumberParam(searchParams.get('lng'))
  const radiusParam = searchParams.get('radiusMeters')
  const radiusMeters = radiusParam === null ? DEFAULT_RADIUS_METERS : parseNumberParam(radiusParam)

  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90
    || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    return NextResponse.json({ error: 'Valid lat and lng are required' }, { status: 400 })
  }

  if (!Number.isFinite(radiusMeters) || radiusMeters <= 0 || radiusMeters > MAX_RADIUS_METERS) {
    return NextResponse.json(
      { error: `radiusMeters must be greater than 0 and at most ${MAX_RADIUS_METERS}` },
      { status: 400 }
    )
  }

  try {
    const supabase = getServerClientFromRequest(request)
    const { data, error } = await supabase.rpc('get_nearby_crags', {
      p_latitude: latitude,
      p_longitude: longitude,
      p_radius_meters: radiusMeters,
      p_limit: RESULT_LIMIT,
    })

    if (error) {
      return createErrorResponse(error, 'Supabase error')
    }

    const crags = data as NearbyCragRow[] | null
    if (!crags || crags.length === 0) {
      return NextResponse.json([], {
        headers: {
          'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=600',
        },
      })
    }

    const results = crags
      .map(({ distance_meters: distanceMeters, ...crag }) => ({
        ...crag,
        countryName: getCountryName(crag.country_code),
        countryCode: crag.country_code,
        regionName: crag.region_name,
        subArea: crag.sub_area,
        distance: Math.round(distanceMeters),
      }))

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
