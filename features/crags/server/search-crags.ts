import type { SupabaseClient } from '@supabase/supabase-js'
import { haversineMeters } from '@/lib/geo/haversine'
import { normalizeCragDuplicateName } from '@/features/crags/lib/crag-duplicates'

interface CragSearchRow {
  id: string
  name: string
  latitude: number | null
  longitude: number | null
  slug: string | null
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

interface SearchCragsOptions {
  supabase: SupabaseClient
  query: string
  latitude: number | null
  longitude: number | null
}

export interface SearchCragsResponseRow {
  id: string
  name: string
  latitude: number | null
  longitude: number | null
  slug: string | null
  countryCode: string | null
  countryName: string | null
  regionName: string | null
  subArea: string | null
  rock_type: string | null
  distance: number | null
}

export async function searchCrags({ supabase, query, latitude, longitude }: SearchCragsOptions) {
  const hasLocation = latitude !== null && longitude !== null

  let nameSelect = supabase
    .from('crags')
    .select('id,name,latitude,longitude,slug,country_code,region_name,sub_area,rock_type')
    .is('deleted_at', null)
    .is('superseded_by', null)
    .eq('publication_status', 'published')

  if (hasLocation) {
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
    return { error: nearbyError, rows: [] as SearchCragsResponseRow[] }
  }

  const rankedById = new Map<string, RankedCragResult>()

  for (const row of (namedCrags || []) as CragSearchRow[]) {
    rankedById.set(row.id, {
      ...row,
      _nameMatch: true,
      _tagMatch: false,
    })
  }

  if (hasLocation) {
    const normalizedQuery = normalizeCragDuplicateName(query)
    const { data: nearbyRows, error: nearbyNormalizedError } = await supabase
      .from('crags')
      .select('id,name,latitude,longitude,slug,country_code,region_name,sub_area,rock_type')
      .is('deleted_at', null)
      .is('superseded_by', null)
      .eq('publication_status', 'published')
      .gte('latitude', latitude - 0.02)
      .lte('latitude', latitude + 0.02)
      .gte('longitude', longitude - 0.03)
      .lte('longitude', longitude + 0.03)
      .limit(80)

    if (!nearbyNormalizedError) {
      for (const row of (nearbyRows || []) as CragSearchRow[]) {
        if (rankedById.has(row.id)) continue
        if (normalizeCragDuplicateName(row.name) !== normalizedQuery) continue

        rankedById.set(row.id, {
          ...row,
          _nameMatch: true,
          _tagMatch: false,
        })
      }
    }
  }

  try {
    const { data: tagRows, error: tagError } = await supabase
      .from('crag_location_tags')
      .select('crag_id, crags!inner(id,name,latitude,longitude,slug,country_code,region_name,sub_area,rock_type), location_tags!inner(name,kind)')
      .is('crags.deleted_at', null)
      .is('crags.superseded_by', null)
      .eq('crags.publication_status', 'published')
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

  if (hasLocation && results.length > 0) {
    results = results.map(crag => {
      const distance = crag.latitude !== null && crag.longitude !== null
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

  return {
    error: null,
    rows: results.map((row) => ({
      id: row.id,
      name: row.name,
      latitude: row.latitude,
      longitude: row.longitude,
      slug: row.slug,
      countryCode: row.country_code,
      countryName: getCountryName(row.country_code),
      regionName: row.region_name,
      subArea: row.sub_area,
      rock_type: row.rock_type,
      distance: row.distance ?? null,
    })),
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
