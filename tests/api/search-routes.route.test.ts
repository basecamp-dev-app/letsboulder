import { NextRequest, NextResponse } from 'next/server'
import { beforeEach, describe, expect, test, vi } from 'vitest'

const { getServerClientFromRequest, getUnauthenticatedClient } = vi.hoisted(() => ({
  getServerClientFromRequest: vi.fn(),
  getUnauthenticatedClient: vi.fn(),
}))

vi.mock('@/lib/supabase-server', () => ({
  getServerClientFromRequest,
  getUnauthenticatedClient,
}))

vi.mock('@/lib/rate-limit', () => ({
  rateLimit: vi.fn(async () => ({ success: true, remaining: 9, resetTime: Date.now() + 1000, limit: 10 })),
  createRateLimitResponse: vi.fn(() => NextResponse.json({ error: 'Too many requests' }, { status: 429 })),
}))

vi.mock('@/lib/errors', () => ({
  createErrorResponse: vi.fn((error: unknown, message: string) =>
    NextResponse.json(
      { error: message, detail: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  ),
}))

import { GET as getCragSearch } from '@/app/api/crags/search/route'
import { GET as getImageSearch } from '@/app/api/images/search/route'
import { GET as getLocationSearch } from '@/app/api/locations/search/route'
import { GET as getPlaceSearch } from '@/app/api/places/search/route'
import { GET as getPlaceNearby } from '@/app/api/places/nearby/route'
import { GET as getCragNearby } from '@/app/api/crags/nearby/route'
import { GET as getCragById } from '@/app/api/crags/search-by-id/route'
import { GET as getRegionSearch } from '@/app/api/regions/search/route'
import { rateLimit } from '@/lib/rate-limit'

type QueryResult = { data: unknown; error: unknown }

function makeThenableResult<T>(result: T) {
  return {
    then: (onFulfilled?: (value: T) => unknown, onRejected?: (reason: unknown) => unknown) =>
      Promise.resolve(result).then(onFulfilled, onRejected),
    catch: (onRejected?: (reason: unknown) => unknown) => Promise.resolve(result).catch(onRejected),
    finally: (onFinally?: () => void) => Promise.resolve(result).finally(onFinally),
  }
}

function createPlacesClient(result: QueryResult) {
  const builder = {
    eq: vi.fn(() => builder),
    gte: vi.fn(() => builder),
    lte: vi.fn(() => builder),
    ilike: vi.fn(() => builder),
    limit: vi.fn(() => makeThenableResult(result)),
  }

  return {
    from: vi.fn((table: string) => {
      if (table !== 'places') throw new Error(`Unexpected table ${table}`)
      return { select: vi.fn(() => builder) }
    }),
  }
}

function createNearbyPlacesClient(result: QueryResult) {
  const builder = {
    eq: vi.fn(() => builder),
    gte: vi.fn(() => builder),
    lte: vi.fn(() => builder),
    order: vi.fn(() => builder),
    limit: vi.fn(() => makeThenableResult(result)),
  }

  return {
    from: vi.fn((table: string) => {
      if (table !== 'places') throw new Error(`Unexpected table ${table}`)
      return { select: vi.fn(() => builder) }
    }),
  }
}

function createCragsClient(namedCrags: unknown[], tagRows: unknown[] = []) {
  const nameBuilder = {
    is: vi.fn(() => nameBuilder),
    eq: vi.fn(() => nameBuilder),
    gte: vi.fn(() => nameBuilder),
    lte: vi.fn(() => nameBuilder),
    ilike: vi.fn(() => nameBuilder),
    limit: vi.fn(() => makeThenableResult({ data: namedCrags, error: null })),
  }

  const tagBuilder = {
    is: vi.fn(() => tagBuilder),
    eq: vi.fn(() => tagBuilder),
    ilike: vi.fn(() => tagBuilder),
    limit: vi.fn(() => makeThenableResult({ data: tagRows, error: null })),
  }

  return {
    from: vi.fn((table: string) => {
      if (table === 'crags') {
        return { select: vi.fn(() => nameBuilder) }
      }
      if (table === 'crag_location_tags') {
        return { select: vi.fn(() => tagBuilder) }
      }
      throw new Error(`Unexpected table ${table}`)
    }),
  }
}

function createNearbyCragsClient(result: QueryResult) {
  return {
    rpc: vi.fn(() => Promise.resolve(result)),
  }
}

function createRegionsClient(result: QueryResult) {
  const builder = {
    eq: vi.fn(() => builder),
    order: vi.fn(() => builder),
    ilike: vi.fn(() => builder),
    limit: vi.fn(() => makeThenableResult(result)),
  }

  return {
    builder,
    from: vi.fn((table: string) => {
      if (table !== 'location_tags') throw new Error(`Unexpected table ${table}`)
      return { select: vi.fn(() => builder) }
    }),
  }
}

function createCragByIdClient(result: QueryResult) {
  const builder = {
    eq: vi.fn(() => builder),
    is: vi.fn(() => builder),
    maybeSingle: vi.fn(() => Promise.resolve(result)),
  }

  return {
    from: vi.fn((table: string) => {
      if (table !== 'crags') throw new Error(`Unexpected table ${table}`)
      return { select: vi.fn(() => builder) }
    }),
  }
}

describe('Search routes', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  test('places search returns empty array for short queries', async () => {
    const response = await getPlaceSearch(new NextRequest('http://localhost:3000/api/places/search?q=a'))
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json).toEqual([])
    expect(getUnauthenticatedClient).not.toHaveBeenCalled()
  })

  test('regions search returns empty array for short queries', async () => {
    const response = await getRegionSearch(new NextRequest('http://localhost:3000/api/regions/search?q=a'))
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json).toEqual([])
    expect(getServerClientFromRequest).not.toHaveBeenCalled()
  })

  test('regions search uses canonical region tags and preserves the legacy shape', async () => {
    const client = createRegionsClient({
      data: [{ id: 'tag-1', name: 'Peak District', country_code: 'GB', created_at: '2026-01-01' }],
      error: null,
    })
    getServerClientFromRequest.mockReturnValue(client)

    const response = await getRegionSearch(new NextRequest('http://localhost:3000/api/regions/search?q=peak'))
    const json = await response.json()

    expect(client.from).toHaveBeenCalledWith('location_tags')
    expect(client.builder.eq).toHaveBeenCalledWith('kind', 'region')
    expect(client.builder.ilike).toHaveBeenCalledWith('name', '%peak%')
    expect(client.builder.limit).toHaveBeenCalledWith(20)
    expect(json).toEqual([expect.objectContaining({ id: 'tag-1', center_lat: null, center_lon: null })])
  })

  test('places search filters by type and sorts by distance', async () => {
    getUnauthenticatedClient.mockReturnValue(createPlacesClient({
      data: [
        { id: 'gym-1', name: 'Far Gym', type: 'gym', latitude: 49.23, longitude: -2.1, primary_discipline: null, disciplines: [] },
        { id: 'gym-2', name: 'Near Gym', type: 'gym', latitude: 49.2005, longitude: -2.1005, primary_discipline: null, disciplines: [] },
      ],
      error: null,
    }))

    const response = await getPlaceSearch(new NextRequest('http://localhost:3000/api/places/search?q=gym&type=gym&lat=49.2&lng=-2.1'))
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.map((row: { id: string }) => row.id)).toEqual(['gym-2', 'gym-1'])
  })

  test('places search keeps zero coordinates when computing distance', async () => {
    getUnauthenticatedClient.mockReturnValue(createPlacesClient({
      data: [
        { id: 'gym-0', name: 'Prime Meridian Gym', type: 'gym', latitude: 0, longitude: 0, primary_discipline: null, disciplines: [] },
      ],
      error: null,
    }))

    const response = await getPlaceSearch(new NextRequest('http://localhost:3000/api/places/search?q=gym&lat=0&lng=0'))
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json[0]).toEqual(expect.objectContaining({ id: 'gym-0', distance: 0 }))
  })

  test('crag search merges tag matches and normalizes country names', async () => {
    getUnauthenticatedClient.mockReturnValue(createCragsClient(
      [
        { id: 'crag-2', name: 'Needles', latitude: 49.2, longitude: -2.1, slug: 'needles', country_code: 'gb', region_name: 'Jersey', sub_area: 'North', rock_type: 'granite' },
      ],
      [
        {
          crag_id: 'crag-1',
          crags: { id: 'crag-1', name: 'Magic Wood', latitude: 49.21, longitude: -2.11, slug: 'magic-wood', country_code: 'ch', region_name: 'Graubunden', sub_area: null, rock_type: 'gneiss' },
        },
      ]
    ))

    const response = await getCragSearch(new NextRequest('http://localhost:3000/api/crags/search?q=ma'))
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json[0]).toEqual(expect.objectContaining({
      id: 'crag-1',
      name: 'Magic Wood',
      slug: 'magic-wood',
      countryCode: 'ch',
      countryName: 'Switzerland',
    }))
    expect(json[1]).toEqual(expect.objectContaining({ id: 'crag-2', name: 'Needles' }))
  })

  test('crag search keeps zero coordinates when computing distance', async () => {
    getUnauthenticatedClient.mockReturnValue(createCragsClient([
      { id: 'crag-0', name: 'Meridian Boulder', latitude: 0, longitude: 0, slug: 'meridian-boulder', country_code: 'gb', region_name: 'Greenwich', sub_area: null, rock_type: 'sandstone' },
    ]))

    const response = await getCragSearch(new NextRequest('http://localhost:3000/api/crags/search?q=me&lat=0&lng=0'))
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json[0]).toEqual(expect.objectContaining({ id: 'crag-0', distance: 0 }))
  })

  test('places nearby keeps zero coordinates when computing distance', async () => {
    getUnauthenticatedClient.mockReturnValue(createNearbyPlacesClient({
      data: [
        { id: 'gym-0', name: 'Origin Gym', type: 'gym', latitude: 0, longitude: 0, rock_type: null, primary_discipline: null, disciplines: [] },
      ],
      error: null,
    }))

    const response = await getPlaceNearby(new NextRequest('http://localhost:3000/api/places/nearby?lat=0&lng=0'))
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json[0]).toEqual(expect.objectContaining({ id: 'gym-0', distance: 0 }))
  })

  test('crags nearby keeps zero coordinates when computing distance', async () => {
    const client = createNearbyCragsClient({
      data: [
        { id: 'crag-0', name: 'Origin Crag', latitude: 0, longitude: 0, rock_type: 'granite', type: 'outdoor', country_code: 'gb', region_name: 'Greenwich', sub_area: null, distance_meters: 0 },
      ],
      error: null,
    })
    getUnauthenticatedClient.mockReturnValue(client)

    const response = await getCragNearby(new NextRequest('http://localhost:3000/api/crags/nearby?lat=0&lng=0'))
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json[0]).toEqual(expect.objectContaining({ id: 'crag-0', distance: 0 }))
    expect(json[0]).not.toHaveProperty('distance_meters')
    expect(client.rpc).toHaveBeenCalledWith('get_nearby_crags', {
      p_latitude: 0,
      p_longitude: 0,
      p_radius_meters: 10_000,
      p_limit: 30,
    })
  })

  test('crags nearby accepts a custom radius in meters', async () => {
    const client = createNearbyCragsClient({ data: [], error: null })
    getUnauthenticatedClient.mockReturnValue(client)

    const response = await getCragNearby(new NextRequest(
      'http://localhost:3000/api/crags/nearby?lat=85&lng=179.9&radiusMeters=25000'
    ))

    expect(response.status).toBe(200)
    expect(client.rpc).toHaveBeenCalledWith('get_nearby_crags', {
      p_latitude: 85,
      p_longitude: 179.9,
      p_radius_meters: 25_000,
      p_limit: 30,
    })
  })

  test('crags nearby accepts coordinate range boundaries', async () => {
    const client = createNearbyCragsClient({ data: [], error: null })
    getUnauthenticatedClient.mockReturnValue(client)

    const response = await getCragNearby(new NextRequest(
      'http://localhost:3000/api/crags/nearby?lat=-90&lng=180'
    ))

    expect(response.status).toBe(200)
    expect(client.rpc).toHaveBeenCalledWith('get_nearby_crags', expect.objectContaining({
      p_latitude: -90,
      p_longitude: 180,
    }))
  })

  test.each([
    'lat=&lng=0',
    'lat=0&lng=',
    'lat=12north&lng=0',
    'lat=91&lng=0',
    'lat=0&lng=-181',
    'lat=Infinity&lng=0',
  ])('crags nearby rejects invalid coordinates: %s', async (query) => {
    const response = await getCragNearby(new NextRequest(`http://localhost:3000/api/crags/nearby?${query}`))

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'Valid lat and lng are required' })
    expect(getUnauthenticatedClient).not.toHaveBeenCalled()
  })

  test.each(['0', '-1', '100001', 'NaN', '10km'])('crags nearby rejects invalid radius: %s', async (radius) => {
    const response = await getCragNearby(new NextRequest(
      `http://localhost:3000/api/crags/nearby?lat=0&lng=0&radiusMeters=${radius}`
    ))

    expect(response.status).toBe(400)
    expect(getUnauthenticatedClient).not.toHaveBeenCalled()
  })

  test('crag by id returns normalized crag payload', async () => {
    getServerClientFromRequest.mockReturnValue(createCragByIdClient({
      data: {
        id: 'crag-1',
        name: 'Harrison\'s Rocks',
        latitude: 51.1,
        longitude: 0.187,
        country_code: 'GB',
        region_name: 'Northern Europe',
        sub_area: null,
        rock_type: 'sandstone',
        type: 'boulder',
        description: null,
        access_notes: null,
        region_id: null,
        created_at: '2026-04-09T00:00:00.000Z',
      },
      error: null,
    }))

    const response = await getCragById(new NextRequest('http://localhost:3000/api/crags/search-by-id?id=crag-1'))
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json).toEqual(expect.objectContaining({
      id: 'crag-1',
      countryCode: 'GB',
      regionName: 'Northern Europe',
      subArea: null,
    }))
  })

  test('image search rejects requests without crag_id or image_id', async () => {
    vi.mocked(rateLimit).mockResolvedValue({ success: true, remaining: 9, resetTime: Date.now() + 1000, limit: 10 })

    const response = await getImageSearch(new NextRequest('http://localhost:3000/api/images/search'))
    const json = await response.json()

    expect(response.status).toBe(400)
    expect(json.error).toBe('crag_id or image_id is required')
  })

  test('image search returns 429 when rate limiting rejects the request', async () => {
    vi.mocked(rateLimit).mockResolvedValueOnce({ success: false, remaining: 0, resetTime: Date.now() + 1000, limit: 10 })

    const response = await getImageSearch(new NextRequest('http://localhost:3000/api/images/search?crag_id=crag-1'))
    const json = await response.json()

    expect(response.status).toBe(429)
    expect(json.error).toBe('Too many requests')
  })

  test('image search returns route lines for image lookups when requested', async () => {
    const supabase = {
      from: vi.fn((table: string) => {
        if (table !== 'images') throw new Error(`Unexpected table ${table}`)
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(async () => ({
                data: {
                  id: 'image-1',
                  url: 'https://example.com/image.jpg',
                  latitude: 49.2,
                  longitude: -2.1,
                  capture_date: '2026-01-01',
                  width: 1200,
                  height: 900,
                  created_at: '2026-01-01T00:00:00.000Z',
                  route_lines: [
                    {
                      id: 'route-line-1',
                      climb_id: 'climb-1',
                      points: [[0, 0], [1, 1]],
                      sequence_order: 1,
                      created_at: '2026-01-01T00:00:00.000Z',
                      climbs: { id: 'climb-1', name: 'Test Climb', grade: '6A', status: 'approved' },
                    },
                  ],
                },
                error: null,
              })),
            })),
          })),
        }
      }),
    }

    getServerClientFromRequest.mockReturnValue(supabase)

    const response = await getImageSearch(new NextRequest('http://localhost:3000/api/images/search?image_id=image-1&include_routes=true'))
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.route_lines).toEqual([
      expect.objectContaining({
        id: 'route-line-1',
        image_id: 'image-1',
        climb_id: 'climb-1',
        climb: { id: 'climb-1', name: 'Test Climb', grade: '6A', status: 'approved' },
      }),
    ])
  })

  test('location search validates query length before calling the external API', async () => {
    const response = await getLocationSearch(new NextRequest('http://localhost:3000/api/locations/search?q=a'))
    const json = await response.json()

    expect(response.status).toBe(400)
    expect(json.error).toBe('Query must be at least 2 characters')
    expect(fetch).not.toHaveBeenCalled()
  })

  test('location search returns normalized Nominatim results', async () => {
    vi.mocked(rateLimit).mockResolvedValue({ success: true, remaining: 9, resetTime: Date.now() + 1000, limit: 10 })
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify([
      {
        lat: '49.2',
        lon: '-2.1',
        display_name: 'St Helier, Jersey, Channel Islands',
        type: 'city',
        address: {
          city: 'St Helier',
          state: 'Jersey',
          country: 'Channel Islands',
          country_code: 'je',
        },
      },
    ]), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }))

    const response = await getLocationSearch(new NextRequest('http://localhost:3000/api/locations/search?q=st%20helier'))
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json).toEqual({
      results: [
        {
          lat: 49.2,
          lon: -2.1,
          name: 'St Helier',
          display_name: 'St Helier, Jersey, Channel Islands',
          type: 'city',
          address: {
            city: 'St Helier',
            state: 'Jersey',
            country: 'Channel Islands',
            country_code: 'je',
          },
        },
      ],
    })
  })
})
