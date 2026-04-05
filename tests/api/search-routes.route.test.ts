import { NextRequest, NextResponse } from 'next/server'
import { beforeEach, describe, expect, test, vi } from 'vitest'

const { getServerClientFromRequest } = vi.hoisted(() => ({
  getServerClientFromRequest: vi.fn(),
}))

vi.mock('@/lib/supabase-server', () => ({
  getServerClientFromRequest,
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

function createCragsClient(namedCrags: unknown[], tagRows: unknown[] = []) {
  const nameBuilder = {
    gte: vi.fn(() => nameBuilder),
    lte: vi.fn(() => nameBuilder),
    ilike: vi.fn(() => nameBuilder),
    limit: vi.fn(() => makeThenableResult({ data: namedCrags, error: null })),
  }

  const tagBuilder = {
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

describe('Search routes', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  test('places search returns empty array for short queries', async () => {
    const response = await getPlaceSearch(new NextRequest('http://localhost:3000/api/places/search?q=a'))
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json).toEqual([])
  })

  test('places search filters by type and sorts by distance', async () => {
    getServerClientFromRequest.mockReturnValue(createPlacesClient({
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

  test('crag search merges tag matches and normalizes country names', async () => {
    getServerClientFromRequest.mockReturnValue(createCragsClient(
      [
        { id: 'crag-2', name: 'Needles', latitude: 49.2, longitude: -2.1, country_code: 'gb', region_name: 'Jersey', sub_area: 'North', rock_type: 'granite' },
      ],
      [
        {
          crag_id: 'crag-1',
          crags: { id: 'crag-1', name: 'Magic Wood', latitude: 49.21, longitude: -2.11, country_code: 'ch', region_name: 'Graubunden', sub_area: null, rock_type: 'gneiss' },
        },
      ]
    ))

    const response = await getCragSearch(new NextRequest('http://localhost:3000/api/crags/search?q=ma'))
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json[0]).toEqual(expect.objectContaining({
      id: 'crag-1',
      name: 'Magic Wood',
      countryCode: 'ch',
      countryName: 'Switzerland',
    }))
    expect(json[1]).toEqual(expect.objectContaining({ id: 'crag-2', name: 'Needles' }))
  })

  test('image search rejects requests without crag_id or image_id', async () => {
    vi.mocked(rateLimit).mockResolvedValue({ success: true, remaining: 9, resetTime: Date.now() + 1000, limit: 10 })

    const response = await getImageSearch(new NextRequest('http://localhost:3000/api/images/search'))
    const json = await response.json()

    expect(response.status).toBe(400)
    expect(json.error).toBe('crag_id or image_id is required')
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
