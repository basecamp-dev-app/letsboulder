import type { SupabaseClient } from '@supabase/supabase-js'

export interface CountryResolutionResult {
  countryId: string | null
  countryCode: string | null
  countryName: string | null
  regionName: string | null
  unRegionName: string | null
  continentName: string | null
  source: 'database' | null
}

export async function resolveCountryFromCoordinates(
  supabase: SupabaseClient,
  latitude: number | null | undefined,
  longitude: number | null | undefined
): Promise<CountryResolutionResult> {
  if (latitude == null || longitude == null) {
    return { countryId: null, countryCode: null, countryName: null, regionName: null, unRegionName: null, continentName: null, source: null }
  }

  const searchLat = latitude
  const searchLng = longitude

  if (!Number.isFinite(searchLat) || !Number.isFinite(searchLng)) {
    return { countryId: null, countryCode: null, countryName: null, regionName: null, unRegionName: null, continentName: null, source: null }
  }

  const { data, error } = await supabase
    .rpc('get_upload_context', { search_lat: searchLat, search_lng: searchLng })

  if (error) {
    console.error('[resolveCountryFromCoordinates] RPC error:', error)
    return { countryId: null, countryCode: null, countryName: null, regionName: null, unRegionName: null, continentName: null, source: null }
  }

  const country = data?.country?.id && data?.country?.iso_a2
    ? data.country
    : data?.country_intersects?.id && data?.country_intersects?.iso_a2
    ? data.country_intersects
    : null

  if (country?.id && country?.iso_a2) {
    return {
      countryId: country.id,
      countryCode: country.iso_a2.toUpperCase().slice(0, 2),
      countryName: country.name || null,
      regionName: data.region.name,
      unRegionName: data.un_region?.name || null,
      continentName: data.continent?.name || null,
      source: 'database'
    }
  }

  return { countryId: null, countryCode: null, countryName: null, regionName: null, unRegionName: null, continentName: null, source: 'database' }
}
