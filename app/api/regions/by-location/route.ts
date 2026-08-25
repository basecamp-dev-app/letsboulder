import { NextRequest, NextResponse } from 'next/server'
import { getServerClientFromRequest } from '@/lib/supabase-server'
import { sanitizeError } from '@/lib/errors'
import type { Json } from '@/types/database'

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

function isJsonObject(value: Json | null): value is { [key: string]: Json | undefined } {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function getJsonObject(value: Json | undefined): { [key: string]: Json | undefined } | null {
  const candidate = value ?? null
  return isJsonObject(candidate) ? candidate : null
}

function getJsonString(value: Json | undefined): string | null {
  return typeof value === 'string' ? value : null
}

function getJsonNumber(value: Json | undefined): number | null {
  return typeof value === 'number' ? value : null
}

export async function GET(request: NextRequest) {
  const supabase = getServerClientFromRequest(request)

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

    const context = isJsonObject(data) ? data : null
    const continent = getJsonObject(context?.continent)
    const unRegion = getJsonObject(context?.un_region)
    const region = getJsonObject(context?.region)
    const country = getJsonObject(context?.country)
    const crag = getJsonObject(context?.crag)
    const cragId = getJsonString(crag?.id)
    const { data: activeCrag } = cragId
      ? await supabase
        .from('crags')
        .select('id')
        .eq('id', cragId)
        .is('deleted_at', null)
        .is('superseded_by', null)
        .maybeSingle()
      : { data: null }
    const activeCragId = activeCrag?.id ?? null

    let nearbyCragDominantRouteType: string | null = null
    if (activeCragId) {
      const { data: climbs } = await supabase
        .from('climbs')
        .select('route_type, status, deleted_at')
        .eq('crag_id', activeCragId)

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
      atlas: country ? {
        continentName: getJsonString(continent?.name) ?? getJsonString(unRegion?.continent_name),
        unRegionName: getJsonString(unRegion?.name),
        adminRegionName: getJsonString(region?.name),
        countryId: getJsonString(country.id),
        countryCode: getJsonString(country.iso_a2),
        countryName: getJsonString(country.name),
      } : null,
      nearbyCrag: crag && activeCragId ? {
        id: activeCragId,
        name: getJsonString(crag.name),
        distanceMeters: getJsonNumber(crag.distance_meters),
        dominantRouteType: nearbyCragDominantRouteType,
      } : null,
      error: null,
    })
  } catch (error) {
    sanitizeError(error, 'Region by location error')
    return NextResponse.json({ atlas: null, nearbyCrag: null, error: 'Failed to resolve location' }, { status: 200 })
  }
}
