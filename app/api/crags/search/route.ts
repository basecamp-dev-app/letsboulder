import { NextRequest, NextResponse } from 'next/server'
import { getServerClientFromRequest } from '@/lib/supabase-server'
import { createErrorResponse } from '@/lib/errors'
import { haversineMeters } from '@/lib/geo/haversine'

export const revalidate = 30

interface CragSearchRow {
  id: string
  name: string
  latitude: number | null
  longitude: number | null
  country_code: string | null
  region_name: string | null
  sub_area: string | null
  rock_type: string | null
}

interface RankedCragResult extends CragSearchRow {
  distance?: number | null
  _nameMatch: boolean
  _tagMatch: boolean
}

export async function GET(request: NextRequest) {
  const supabase = getServerClientFromRequest(request)

  const { searchParams } = new URL(request.url)
  const query = searchParams.get('q')?.toLowerCase() || ''
  const latParam = searchParams.get('lat')
  const lngParam = searchParams.get('lng')

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
    let nameSelect = supabase
      .from('crags')
      .select('id,name,latitude,longitude,country_code,region_name,sub_area,rock_type')

    if (hasLocation && latitude !== null && longitude !== null) {
      const latRange = 0.1
      const lngRange = 0.1
      nameSelect = nameSelect
        .gte('latitude', latitude - latRange)
        .lte('latitude', latitude + latRange)
        .gte('longitude', longitude - lngRange)
        .lte('longitude', longitude + lngRange)
    }

    const { data: namedCrags, error: nearbyError } = await nameSelect
      .ilike('name', `%${query}%`)
      .limit(50)

    if (nearbyError) {
      return createErrorResponse(nearbyError, 'Supabase error')
    }

    const rankedById = new Map<string, RankedCragResult>()

    for (const row of (namedCrags || []) as CragSearchRow[]) {
      rankedById.set(row.id, {
        ...row,
        _nameMatch: true,
        _tagMatch: false,
      })
    }

    try {
      const { data: tagRows, error: tagError } = await supabase
        .from('crag_location_tags')
        .select('crag_id, crags!inner(id,name,latitude,longitude,country_code,region_name,sub_area,rock_type), location_tags!inner(name,kind)')
        .eq('location_tags.kind', 'region')
        .ilike('location_tags.name', `%${query}%`)
        .limit(80)

      if (!tagError) {
        for (const row of (tagRows || []) as Array<{
          crag_id: string
          crags: CragSearchRow | CragSearchRow[] | null
        }>) {
          const related = Array.isArray(row.crags) ? row.crags[0] : row.crags
          if (!related?.id) continue

          const existing = rankedById.get(related.id)
          if (existing) {
            existing._tagMatch = true
            continue
          }

          rankedById.set(related.id, {
            ...related,
            _nameMatch: false,
            _tagMatch: true,
          })
        }
      }
    } catch {
      // Ignore tag lookup failures so crag name search still works.
    }

    let results: RankedCragResult[] = Array.from(rankedById.values())

    if (hasLocation && latitude !== null && longitude !== null && results.length > 0) {
      results = results.map(crag => {
        const distance = crag.latitude && crag.longitude
          ? Math.round(haversineMeters(latitude, longitude, crag.latitude, crag.longitude))
          : null
        return { ...crag, distance }
      }).sort((a, b) => {
        const aExact = a.name.toLowerCase() === query
        const bExact = b.name.toLowerCase() === query
        if (aExact !== bExact) return aExact ? -1 : 1

        const aStartsWith = a.name.toLowerCase().startsWith(query)
        const bStartsWith = b.name.toLowerCase().startsWith(query)
        if (aStartsWith !== bStartsWith) return aStartsWith ? -1 : 1

        if (a._nameMatch !== b._nameMatch) return a._nameMatch ? -1 : 1
        if (a.distance === null) return 1
        if (b.distance === null) return -1
        if (a.distance !== b.distance) return a.distance - b.distance
        return a.name.localeCompare(b.name)
      }).slice(0, 30)
    } else {
      results = results.sort((a, b) => {
        const aExact = a.name.toLowerCase() === query
        const bExact = b.name.toLowerCase() === query
        if (aExact !== bExact) return aExact ? -1 : 1

        const aStartsWith = a.name.toLowerCase().startsWith(query)
        const bStartsWith = b.name.toLowerCase().startsWith(query)
        if (aStartsWith !== bStartsWith) return aStartsWith ? -1 : 1

        if (a._nameMatch !== b._nameMatch) return a._nameMatch ? -1 : 1
        return a.name.localeCompare(b.name)
      }).slice(0, 30)
    }

    const responseRows = results.map((row) => ({
      id: row.id,
      name: row.name,
      latitude: row.latitude,
      longitude: row.longitude,
      countryCode: row.country_code,
      countryName: getCountryName(row.country_code),
      regionName: row.region_name,
      subArea: row.sub_area,
      rock_type: row.rock_type,
      distance: row.distance ?? null,
    }))

    return NextResponse.json(responseRows, {
      headers: {
        'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=300',
      },
    })
  } catch (error) {
    return createErrorResponse(error, 'Error searching crags')
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

