import type { SupabaseClient } from '@supabase/supabase-js'

export interface CountryResolutionResult {
  countryCode: string | null
  regionId: string | null
  regionName: string | null
  source: 'database' | 'nominatim' | null
}

interface FindRegionResult {
  id: string
  name: string
  country_code: string | null
}

const NOMINATIM_USER_AGENT = 'LetsBoulder/1.0 (contact@letsboulder.com)'

export async function resolveCountryFromCoordinates(
  supabase: SupabaseClient,
  latitude: number | null | undefined,
  longitude: number | null | undefined
): Promise<CountryResolutionResult> {
  if (latitude == null || longitude == null) {
    return { countryCode: null, regionId: null, regionName: null, source: null }
  }

  const searchLat = latitude
  const searchLng = longitude

  if (!Number.isFinite(searchLat) || !Number.isFinite(searchLng)) {
    return { countryCode: null, regionId: null, regionName: null, source: null }
  }

  // Tier 1: Database lookup
  const { data: regionRows, error: rpcError } = await supabase
    .rpc('find_region_by_location', { search_lat: searchLat, search_lng: searchLng })

  if (rpcError) {
    console.error('[resolveCountryFromCoordinates] RPC error:', rpcError)
  }

  if (Array.isArray(regionRows) && regionRows.length > 0) {
    const r = regionRows[0] as unknown as FindRegionResult
    if (r?.id && r?.country_code) {
      return {
        countryCode: r.country_code.toUpperCase().slice(0, 2),
        regionId: r.id,
        regionName: r.name,
        source: 'database'
      }
    }
  }

  // Tier 2: Nominatim fallback
  try {
    const nominatimUrl = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${searchLat}&lon=${searchLng}&zoom=3`
    const response = await fetch(nominatimUrl, {
      headers: { 'User-Agent': NOMINATIM_USER_AGENT }
    })

    if (response.ok) {
      const data = await response.json()
      if (data?.address?.country_code) {
        const countryCode = data.address.country_code.toUpperCase()
        console.log(`[resolveCountryFromCoordinates] Fallback resolved: ${countryCode}`)
        return {
          countryCode,
          regionId: null,
          regionName: null,
          source: 'nominatim'
        }
      }
    }
  } catch (err) {
    console.error('[resolveCountryFromCoordinates] Nominatim fallback failed:', err)
  }

  return { countryCode: null, regionId: null, regionName: null, source: null }
}
