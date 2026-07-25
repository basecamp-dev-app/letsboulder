import type { SupabaseClient } from '@supabase/supabase-js'
import { reportError } from '@/lib/errors'

export interface CountryResolutionResult {
  countryId: string | null
  countryCode: string | null
  countryName: string | null
  regionName: string | null
  unRegionName: string | null
  continentName: string | null
  source: 'database' | 'nominatim' | null
}

function emptyCountryResolution(source: CountryResolutionResult['source'] = null): CountryResolutionResult {
  return { countryId: null, countryCode: null, countryName: null, regionName: null, unRegionName: null, continentName: null, source }
}

const nominatimCache = new Map<string, { expiresAt: number; result: CountryResolutionResult }>()
const nominatimInFlight = new Map<string, Promise<CountryResolutionResult>>()
let nominatimQueue: Promise<void> = Promise.resolve()
let lastNominatimRequestAt = 0

async function fetchCountryFromNominatim(latitude: number, longitude: number): Promise<CountryResolutionResult> {
  try {
    const turn = nominatimQueue.then(async () => {
      const waitMs = Math.max(0, 1_100 - (Date.now() - lastNominatimRequestAt))
      if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs))
      lastNominatimRequestAt = Date.now()
    })
    nominatimQueue = turn.catch(() => undefined)
    await turn

    const params = new URLSearchParams({
      format: 'json',
      lat: String(latitude),
      lon: String(longitude),
      addressdetails: '1',
      zoom: '10',
    })
    const response = await fetch(`https://nominatim.openstreetmap.org/reverse?${params}`, {
      headers: { 'User-Agent': 'letsboulder-climbing-app (contact@letsboulder.com)' },
      signal: AbortSignal.timeout(8_000),
    })
    if (!response.ok) return emptyCountryResolution()

    const payload: unknown = await response.json()
    if (!payload || typeof payload !== 'object') return emptyCountryResolution()
    const address = 'address' in payload && payload.address && typeof payload.address === 'object'
      ? payload.address as Record<string, unknown>
      : null
    const countryCode = typeof address?.country_code === 'string'
      ? address.country_code.trim().toUpperCase().slice(0, 2)
      : ''
    if (!/^[A-Z]{2}$/.test(countryCode)) return emptyCountryResolution()

    const regionName = [address?.state, address?.region, address?.county]
      .find((value): value is string => typeof value === 'string' && value.trim().length > 0)

    return {
      countryId: null,
      countryCode,
      countryName: typeof address?.country === 'string' ? address.country : null,
      regionName: regionName || null,
      unRegionName: null,
      continentName: null,
      source: 'nominatim',
    }
  } catch (error) {
    reportError(error, { message: '[resolveCountryFromCoordinates] Nominatim fallback error' })
    return emptyCountryResolution()
  }
}

async function resolveCountryFromNominatim(latitude: number, longitude: number): Promise<CountryResolutionResult> {
  const cacheKey = `${latitude.toFixed(5)},${longitude.toFixed(5)}`
  const cached = nominatimCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) return cached.result

  const existingRequest = nominatimInFlight.get(cacheKey)
  if (existingRequest) return existingRequest

  const request = fetchCountryFromNominatim(latitude, longitude)
    .then((result) => {
      if (result.countryCode) {
        if (nominatimCache.size >= 500) {
          const oldestKey = nominatimCache.keys().next().value
          if (typeof oldestKey === 'string') nominatimCache.delete(oldestKey)
        }
        nominatimCache.set(cacheKey, { expiresAt: Date.now() + 24 * 60 * 60 * 1_000, result })
      }
      return result
    })
    .finally(() => nominatimInFlight.delete(cacheKey))

  nominatimInFlight.set(cacheKey, request)
  return request
}

export async function resolveCountryFromCoordinates(
  supabase: SupabaseClient,
  latitude: number | null | undefined,
  longitude: number | null | undefined
): Promise<CountryResolutionResult> {
  if (latitude == null || longitude == null) {
    return emptyCountryResolution()
  }

  const searchLat = latitude
  const searchLng = longitude

  if (!Number.isFinite(searchLat) || !Number.isFinite(searchLng)) {
    return emptyCountryResolution()
  }

  const { data, error } = await supabase
    .rpc('get_upload_context', { search_lat: searchLat, search_lng: searchLng })

  if (error) {
    reportError(error, { message: '[resolveCountryFromCoordinates] RPC error' })
    return resolveCountryFromNominatim(searchLat, searchLng)
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
      regionName: data.region?.name || null,
      unRegionName: data.un_region?.name || null,
      continentName: data.continent?.name || null,
      source: 'database'
    }
  }

  return resolveCountryFromNominatim(searchLat, searchLng)
}
