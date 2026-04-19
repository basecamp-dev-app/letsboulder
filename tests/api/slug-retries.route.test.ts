import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, test, vi } from 'vitest'

vi.mock('@/lib/csrf-server', () => ({
  withApiMiddleware: vi.fn(),
}))

vi.mock('@/lib/supabase-server', () => ({
  getServerClientFromRequest: vi.fn(),
}))

vi.mock('@/lib/location/resolve-country', () => ({
  resolveCountryFromCoordinates: vi.fn(),
}))

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

vi.mock('@/lib/rate-limit', () => ({
  rateLimit: vi.fn(() => ({ success: true })),
  createRateLimitResponse: vi.fn(() => null),
  RATE_LIMITS: {
    authenticatedWrite: { maxRequests: 100, windowMs: 3600000 },
  },
}))

import { POST as postPlace } from '@/app/api/places/route'
import { POST as postGym } from '@/app/api/admin/gyms/route'
import { POST as postCrag } from '@/app/api/crags/route'
import { withApiMiddleware } from '@/lib/csrf-server'
import { getServerClientFromRequest } from '@/lib/supabase-server'
import { resolveCountryFromCoordinates } from '@/lib/location/resolve-country'

type MiddlewareResult = Awaited<ReturnType<typeof withApiMiddleware>>

function makeRequest(url: string, body: unknown) {
  return new NextRequest(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-csrf-token': 'test-csrf-token',
    },
    body: JSON.stringify(body),
  })
}

function makeThenableResult<T>(result: T) {
  return {
    then: (onFulfilled?: (value: T) => unknown, onRejected?: (reason: unknown) => unknown) =>
      Promise.resolve(result).then(onFulfilled, onRejected),
    catch: (onRejected?: (reason: unknown) => unknown) => Promise.resolve(result).catch(onRejected),
    finally: (onFinally?: () => void) => Promise.resolve(result).finally(onFinally),
  }
}

function makeSelectChain<T>(result: T) {
  const chain = {
    eq: vi.fn(() => chain),
    not: vi.fn(() => chain),
    ilike: vi.fn(() => chain),
    gte: vi.fn(() => chain),
    lte: vi.fn(() => chain),
    limit: vi.fn(() => makeThenableResult(result)),
    maybeSingle: vi.fn(async () => result),
    single: vi.fn(async () => result),
  }

  return chain
}

describe('Slug retry routes', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(resolveCountryFromCoordinates).mockResolvedValue({
      countryCode: 'US',
      countryId: 'country-1',
      countryName: 'United States',
      regionName: 'Colorado',
      unRegionName: 'Northern America',
      continentName: 'North America',
      source: 'database',
    })
  })

  test('places route computes a suffixed slug when the base slug is already used', async () => {
    const insertPayloads: Array<{ slug: string | null }> = []

    vi.mocked(withApiMiddleware).mockResolvedValue({
      ok: true,
      userId: 'user-1',
      supabase: {
        auth: {
          getUser: vi.fn(async () => ({ data: { user: { id: 'user-1', app_metadata: { gym_owner: true } } }, error: null })),
        },
        from: vi.fn((table: string) => {
          if (table === 'profiles') {
            return {
              select: vi.fn(() => makeSelectChain({ data: { is_admin: false }, error: null })),
            }
          }

          if (table === 'places') {
            return {
              select: vi.fn((query: string) => {
                if (query === 'id, name') {
                  return makeSelectChain({ data: [], error: null })
                }

                if (query === 'slug') {
                  return makeSelectChain({
                    data: [
                      { slug: 'shelf-road' },
                    ],
                    error: null,
                  })
                }

                return makeSelectChain({ data: [], error: null })
              }),
              insert: vi.fn((payload: { slug: string | null }) => {
                insertPayloads.push(payload)
                return {
                  select: vi.fn(() => ({
                    single: vi.fn(async () => ({
                      data: { id: 'place-1', name: 'Shelf Road', slug: payload.slug, country_code: 'US' },
                      error: null,
                    })),
                  })),
                }
              }),
            }
          }

          return {
            select: vi.fn(() => makeThenableResult({ data: [], error: null })),
          }
        }),
      } as never,
    } as unknown as MiddlewareResult)

    const response = await postPlace(makeRequest('http://localhost:3000/api/places', {
      name: 'Shelf Road',
      type: 'crag',
      latitude: 38.64,
      longitude: -105.22,
      disciplines: ['sport'],
    }))
    const json = await response.json()

    expect(response.status).toBe(201)
    expect(insertPayloads).toEqual([
      expect.objectContaining({ slug: 'shelf-road-2' }),
    ])
    expect(json.slug).toBe('shelf-road-2')
  })

  test('admin gyms route computes a suffixed slug when the base slug is already used', async () => {
    const insertPayloads: Array<{ slug: string }> = []

    vi.mocked(withApiMiddleware).mockResolvedValue({
      ok: true,
      userId: 'admin-1',
      supabase: {} as never,
    } as unknown as MiddlewareResult)

    vi.mocked(getServerClientFromRequest).mockReturnValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: 'admin-1' } }, error: null })),
      },
      from: vi.fn((table: string) => {
        if (table === 'profiles') {
          return {
            select: vi.fn(() => makeSelectChain({ data: { is_admin: true }, error: null })),
          }
        }

        if (table === 'places') {
          return {
            select: vi.fn((query: string) => {
              if (query === 'id, name') {
                return makeSelectChain({ data: [], error: null })
              }

              if (query === 'slug') {
                return makeSelectChain({
                  data: [
                    { slug: 'movement' },
                  ],
                  error: null,
                })
              }

              return makeSelectChain({ data: [], error: null })
            }),
            insert: vi.fn((payload: { slug: string }) => {
              insertPayloads.push(payload)
              return {
                select: vi.fn(() => ({
                  single: vi.fn(async () => ({
                    data: { id: 'gym-1', name: 'Movement', slug: payload.slug, country_code: 'US' },
                    error: null,
                  })),
                })),
              }
            }),
          }
        }

        return {
          select: vi.fn(() => makeThenableResult({ data: [], error: null })),
        }
      }),
    } as never)

    const response = await postGym(makeRequest('http://localhost:3000/api/admin/gyms', {
      name: 'Movement',
      latitude: 39.7,
      longitude: -104.9,
      disciplines: ['boulder'],
      primary_discipline: 'boulder',
    }))
    const json = await response.json()

    expect(response.status).toBe(201)
    expect(insertPayloads).toEqual([
      expect.objectContaining({ slug: 'movement-2' }),
    ])
    expect(json.slug).toBe('movement-2')
  })

  test('crags route computes a suffixed slug when the base slug is already used', async () => {
    const insertPayloads: Array<{ slug: string }> = []

    vi.mocked(withApiMiddleware).mockResolvedValue({
      ok: true,
      supabase: {
        auth: {
          getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } }, error: null })),
        },
        from: vi.fn((table: string) => {
          if (table === 'crags') {
            return {
              select: vi.fn((query: string) => {
                if (query === 'id, name' || query === 'id, name, latitude, longitude') {
                  return makeSelectChain({ data: [], error: null })
                }

                if (query === 'slug') {
                  return makeSelectChain({
                    data: [
                      { slug: 'smith-rock' },
                    ],
                    error: null,
                  })
                }

                return makeSelectChain({ data: [], error: null })
              }),
              insert: vi.fn((payload: { slug: string }) => {
                insertPayloads.push(payload)
                return {
                  select: vi.fn(() => ({
                    single: vi.fn(async () => ({
                      data: {
                        id: 'crag-1',
                        name: 'Smith Rock',
                        slug: payload.slug,
                        country_code: 'US',
                        latitude: 44.36,
                        longitude: -121.14,
                        rock_type: 'tuff',
                        type: 'sport',
                        region_name: 'Oregon',
                        sub_area: null,
                        created_at: new Date().toISOString(),
                      },
                      error: null,
                    })),
                  })),
                }
              }),
            }
          }

          if (table === 'profiles') {
            return {
              select: vi.fn(() => makeSelectChain({ data: { is_admin: false }, error: null })),
            }
          }

          if (table === 'location_tags' || table === 'crag_location_tags') {
            return {
              select: vi.fn(() => makeSelectChain({ data: null, error: null })),
              insert: vi.fn(() => ({
                select: vi.fn(() => ({
                  single: vi.fn(async () => ({ data: { id: 'tag-1' }, error: null })),
                })),
              })),
            }
          }

          return {
            select: vi.fn(() => makeThenableResult({ data: [], error: null })),
            insert: vi.fn(async () => ({ error: null })),
          }
        }),
        rpc: vi.fn(async () => ({ data: null, error: null })),
      } as never,
    } as unknown as MiddlewareResult)

    const response = await postCrag(makeRequest('http://localhost:3000/api/crags', {
      name: 'Smith Rock',
      latitude: 44.36,
      longitude: -121.14,
      type: 'sport',
      rock_type: 'tuff',
    }))
    const json = await response.json()

    expect(response.status).toBe(201)
    expect(insertPayloads).toEqual([
      expect.objectContaining({ slug: 'smith-rock-2', country_code: 'US' }),
    ])
    expect(json.slug).toBe('smith-rock-2')
  })

  test('crags route accepts null optional fields during creation', async () => {
    vi.mocked(withApiMiddleware).mockResolvedValue({
      ok: true,
      supabase: {
        auth: {
          getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } }, error: null })),
        },
        from: vi.fn((table: string) => {
          if (table === 'crags') {
            return {
              select: vi.fn((query: string) => {
                if (query === 'id, name' || query === 'id, name, latitude, longitude') {
                  return makeSelectChain({ data: [], error: null })
                }

                if (query === 'slug') {
                  return makeSelectChain({ data: [], error: null })
                }

                return makeSelectChain({ data: [], error: null })
              }),
              insert: vi.fn(() => ({
                select: vi.fn(() => ({
                  single: vi.fn(async () => ({
                    data: {
                      id: 'crag-2',
                      name: 'Stone Garden',
                      slug: 'stone-garden',
                      country_code: 'US',
                      latitude: 44.36,
                      longitude: -121.14,
                      rock_type: null,
                      type: 'sport',
                      region_name: 'Colorado',
                      sub_area: null,
                      created_at: new Date().toISOString(),
                    },
                    error: null,
                  })),
                })),
              })),
            }
          }

          if (table === 'profiles') {
            return {
              select: vi.fn(() => makeSelectChain({ data: { is_admin: false }, error: null })),
            }
          }

          if (table === 'location_tags' || table === 'crag_location_tags') {
            return {
              select: vi.fn(() => makeSelectChain({ data: null, error: null })),
              insert: vi.fn(() => ({
                select: vi.fn(() => ({
                  single: vi.fn(async () => ({ data: { id: 'tag-1' }, error: null })),
                })),
              })),
            }
          }

          return {
            select: vi.fn(() => makeThenableResult({ data: [], error: null })),
            insert: vi.fn(async () => ({ error: null })),
          }
        }),
        rpc: vi.fn(async () => ({ data: null, error: null })),
      } as never,
    } as unknown as MiddlewareResult)

    const response = await postCrag(makeRequest('http://localhost:3000/api/crags', {
      name: 'Stone Garden',
      latitude: 44.36,
      longitude: -121.14,
      type: 'sport',
      rock_type: null,
      sub_area: null,
    }))

    expect(response.status).toBe(201)
  })

  test('crags route rejects coordinate-based creation when country resolution fails', async () => {
    const insertCrag = vi.fn()

    vi.mocked(resolveCountryFromCoordinates).mockResolvedValue({
      countryCode: null,
      countryId: null,
      countryName: null,
      regionName: null,
      unRegionName: null,
      continentName: null,
      source: 'database',
    })

    vi.mocked(withApiMiddleware).mockResolvedValue({
      ok: true,
      supabase: {
        auth: {
          getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } }, error: null })),
        },
        from: vi.fn((table: string) => {
          if (table === 'crags') {
            return {
              select: vi.fn((query: string) => {
                if (query === 'id, name' || query === 'id, name, latitude, longitude') {
                  return makeSelectChain({ data: [], error: null })
                }

                if (query === 'slug') {
                  return makeSelectChain({ data: [], error: null })
                }

                return makeSelectChain({ data: [], error: null })
              }),
              insert: insertCrag,
            }
          }

          if (table === 'profiles') {
            return {
              select: vi.fn(() => makeSelectChain({ data: { is_admin: false }, error: null })),
            }
          }

          if (table === 'location_tags' || table === 'crag_location_tags') {
            return {
              select: vi.fn(() => makeSelectChain({ data: null, error: null })),
              insert: vi.fn(async () => ({ error: null })),
            }
          }

          return {
            select: vi.fn(() => makeThenableResult({ data: [], error: null })),
            insert: vi.fn(async () => ({ error: null })),
          }
        }),
        rpc: vi.fn(async () => ({ data: null, error: null })),
      } as never,
    } as unknown as MiddlewareResult)

    const response = await postCrag(makeRequest('http://localhost:3000/api/crags', {
      name: 'Bowles Rocks',
      latitude: 51.0754644,
      longitude: 0.1989174,
      type: 'boulder',
      rock_type: 'Southern Sandstone',
      sub_area: 'Fandango Wall',
    }))
    const json = await response.json()

    expect(response.status).toBe(400)
    expect(json).toEqual({
      error: 'Could not resolve country from this crag location. Please ensure your pin is on land.',
    })
    expect(insertCrag).not.toHaveBeenCalled()
  })
})
