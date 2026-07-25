import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveCountryFromCoordinates } from '@/lib/location/resolve-country'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('resolveCountryFromCoordinates', () => {
  it('falls back to Nominatim when atlas country data is empty', async () => {
    const supabase = {
      rpc: vi.fn(async () => ({
        data: { country: null, country_intersects: null },
        error: null,
      })),
    } as unknown as SupabaseClient
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      address: {
        country: 'Guernsey',
        country_code: 'gg',
        state: 'Channel Islands',
      },
    }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await resolveCountryFromCoordinates(supabase, 49.45, -2.55)

    expect(result).toEqual(expect.objectContaining({
      countryCode: 'GG',
      countryName: 'Guernsey',
      regionName: 'Channel Islands',
      source: 'nominatim',
    }))
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('lat=49.45&lon=-2.55'),
      expect.objectContaining({ headers: expect.objectContaining({ 'User-Agent': expect.stringContaining('letsboulder') }) }),
    )
  })

  it('prefers atlas country data without an external request', async () => {
    const supabase = {
      rpc: vi.fn(async () => ({
        data: {
          country: { id: 'country-1', iso_a2: 'GB', name: 'United Kingdom' },
          country_intersects: null,
          region: null,
          un_region: null,
          continent: null,
        },
        error: null,
      })),
    } as unknown as SupabaseClient
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const result = await resolveCountryFromCoordinates(supabase, 51.1, 0.18)

    expect(result.countryCode).toBe('GB')
    expect(result.source).toBe('database')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
