import { beforeEach, describe, expect, test, vi } from 'vitest'
import { createServerClient } from '@supabase/ssr'

const { adminRpcMock } = vi.hoisted(() => ({
  adminRpcMock: vi.fn(),
}))

vi.mock('@/lib/discord', () => ({
  notifyNewSubmission: vi.fn(async () => undefined),
}))

vi.mock('@/lib/location/resolve-country', () => ({
  resolveCountryFromCoordinates: vi.fn(async () => ({
    countryId: null,
    countryCode: 'GG',
    countryName: 'Guernsey',
    regionName: 'Northern Europe',
    unRegionName: null,
    continentName: null,
    source: 'nominatim',
  })),
}))

vi.mock('@/lib/supabase-admin', () => ({
  getAdminClientWithAudit: () => ({ rpc: adminRpcMock }),
}))

import { promoteDraftToSubmission } from '@/features/submissions/server/drafts/draft-promote'
import { notifyNewSubmission } from '@/lib/discord'
import { resolveCountryFromCoordinates } from '@/lib/location/resolve-country'

function makeThenableResult<T>(result: T) {
  return {
    then: (onFulfilled?: (value: T) => unknown, onRejected?: (reason: unknown) => unknown) =>
      Promise.resolve(result).then(onFulfilled, onRejected),
    catch: (onRejected?: (reason: unknown) => unknown) => Promise.resolve(result).catch(onRejected),
    finally: (onFinally?: () => void) => Promise.resolve(result).finally(onFinally),
  }
}

function makeSupabase(options?: {
  includeAllImageRoutes?: boolean
  includeFallbackRouteData?: boolean
  mediaReady?: boolean
  draftStatus?: 'draft' | 'submitted'
  cragCountryCode?: string | null
  draftHasLocation?: boolean
}) {
  const includeAllImageRoutes = options?.includeAllImageRoutes ?? true
  const includeFallbackRouteData = options?.includeFallbackRouteData ?? false

  return {
    from: vi.fn((table: string) => {
      if (table === 'submission_drafts') {
        return {
          update: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    select: vi.fn(() => ({
                      maybeSingle: vi.fn(async () => ({ data: { id: 'draft-1' }, error: null })),
                    })),
                  })),
                })),
              })),
            })),
          })),
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: {
                  id: 'draft-1',
                  user_id: 'user-1',
                  crag_id: 'crag-1',
                  status: options?.draftStatus || 'draft',
                  updated_at: '2026-03-01T00:00:00Z',
                  metadata: {
                    navigation: { defaultImageId: 'draft-image-1' },
                    submission: options?.draftHasLocation === false
                      ? {}
                      : { location: { latitude: 49.45, longitude: -2.55, countryCode: 'GG' } },
                    ...(options?.draftStatus === 'submitted' ? {
                      publishedImageId: 'image-1',
                      allPublishedImageIds: ['image-1'],
                      publishedClimbIds: ['climb-1'],
                      publishedRouteLineIds: ['route-line-1'],
                      publishedAt: '2026-03-01T00:00:00Z',
                    } : {}),
                  },
                },
                error: null,
              })),
            })),
          })),
        }
      }

      if (table === 'submission_draft_images') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => makeThenableResult({
              data: [
                {
                  id: 'draft-image-1',
                  linked_image_id: 'image-1',
                  display_order: 0,
                  latitude: 49.45,
                  longitude: -2.55,
                  route_data: includeFallbackRouteData
                    ? {
                        completedRoutes: [{
                          id: 'draft-route-1',
                          name: 'Recovered route',
                          grade: '6A',
                          description: '',
                          climbType: 'sport',
                          points: [{ x: 0.1, y: 0.1 }, { x: 0.2, y: 0.2 }],
                          sequenceOrder: 0,
                          imageWidth: 1200,
                          imageHeight: 1200,
                        }],
                      }
                    : null,
                },
                { id: 'draft-image-2', linked_image_id: 'image-2', display_order: 1, latitude: 49.46, longitude: -2.54, route_data: null },
              ],
              error: null,
            })),
          })),
        }
      }

      if (table === 'crags') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: { id: 'crag-1', country_code: options?.cragCountryCode === undefined ? 'GG' : options.cragCountryCode, slug: 'hidden-crag' },
                error: null,
              })),
            })),
          })),
        }
      }

      if (table === 'submission_draft_routes') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => makeThenableResult({
              data: includeAllImageRoutes
                ? [
                  { id: 'draft-route-1', draft_image_id: 'draft-image-1' },
                  { id: 'draft-route-2', draft_image_id: 'draft-image-2' },
                ]
                : [{ id: 'draft-route-2', draft_image_id: 'draft-image-2' }],
              error: null,
            })),
          })),
        }
      }

      if (table === 'images') {
        const readyRows = [
          { id: 'image-1', processing_status: 'ready', moderation_status: 'approved', visibility: 'public', status: 'approved' },
          { id: 'image-2', processing_status: 'ready', moderation_status: 'skipped', visibility: 'public', status: 'approved' },
        ].map((row) => options?.mediaReady === false ? { ...row, processing_status: 'processing' } : row)
        return {
          select: vi.fn(() => ({
            in: vi.fn(async (_column: string, ids: string[]) => ({ data: readyRows.filter((row) => ids.includes(row.id)), error: null })),
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: {
                  id: 'image-1',
                  crag_id: 'crag-1',
                  crags: { name: 'Hidden Crag', country_code: 'GG', slug: 'hidden-crag' },
                  route_lines: [
                    { id: 'route-line-1', climb_id: 'climb-1', sequence_order: 0, created_at: '2026-03-01T00:00:00Z' },
                  ],
                },
                error: null,
              })),
            })),
          })),
        }
      }

      if (table === 'climbs') {
        return {
          select: vi.fn(() => ({
            in: vi.fn(() => makeThenableResult({
              data: [
                { id: 'climb-1', name: 'Test Route', grade: '6A' },
              ],
              error: null,
            })),
          })),
        }
      }

      throw new Error(`Unexpected table: ${table}`)
    }),
    rpc: vi.fn(async (fnName: string) => {
      if (fnName === 'has_valid_open_data_consent') return { data: true, error: null }
      if (fnName === 'promote_draft_to_submission') {
        return {
          data: {
            success: true,
            status: 'submitted',
            image_id: 'image-1',
            default_image_id: 'image-1',
            image_ids: ['image-1'],
            climb_ids: ['climb-1'],
            route_line_ids: ['route-line-1'],
            published_at: '2026-03-01T00:00:00Z',
          },
          error: null,
        }
      }

      return { data: null, error: null }
    }),
  }
}

describe('promoteDraftToSubmission', () => {
  beforeEach(() => {
    adminRpcMock.mockReset()
    adminRpcMock.mockResolvedValue({ data: 'GG', error: null })
  })

  test('rejects publication until every linked image is publicly deliverable', async () => {
    const supabase = makeSupabase({ mediaReady: false })

    const response = await promoteDraftToSubmission({
      supabase: supabase as unknown as ReturnType<typeof createServerClient>,
      request: new Request('http://localhost:3000/api/submissions/drafts/draft-1/promote', { method: 'POST' }),
      draftId: 'draft-1',
      userId: 'user-1',
    })

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual({
      code: 'media_not_ready',
      error: 'Some photos are still being prepared or reviewed.',
      message: 'Some photos are still being prepared or reviewed.',
    })
    expect(supabase.rpc).not.toHaveBeenCalledWith('promote_draft_to_submission', expect.anything())
  })

  test('sends a Discord notification after publishing a draft', async () => {
    const supabase = makeSupabase()

    const response = await promoteDraftToSubmission({
      supabase: supabase as unknown as ReturnType<typeof createServerClient>,
      request: new Request('http://localhost:3000/api/submissions/drafts/draft-1/promote', { method: 'POST' }),
      draftId: 'draft-1',
      userId: 'user-1',
    })

    expect(response.status).toBe(200)
    expect(vi.mocked(notifyNewSubmission)).toHaveBeenCalledTimes(1)
    expect(vi.mocked(notifyNewSubmission)).toHaveBeenCalledWith(
      supabase,
      [{ id: 'climb-1', name: 'Test Route', grade: '6A' }],
      'Hidden Crag',
      'crag-1',
      'user-1'
    )
  })

  test('recovers an already-published draft and repairs missing crag country metadata without promoting twice', async () => {
    vi.mocked(notifyNewSubmission).mockClear()
    const supabase = makeSupabase({ draftStatus: 'submitted', cragCountryCode: null })

    const response = await promoteDraftToSubmission({
      supabase: supabase as unknown as ReturnType<typeof createServerClient>,
      request: new Request('http://localhost:3000/api/submissions/drafts/draft-1/promote', { method: 'POST' }),
      draftId: 'draft-1',
      userId: 'user-1',
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual(expect.objectContaining({
      published: expect.objectContaining({
        defaultImageId: 'image-1',
        canonicalPath: '/gg/hidden-crag/i/image-1',
      }),
    }))
    expect(adminRpcMock).toHaveBeenCalledWith('repair_submission_draft_crag_country', {
      p_draft_id: 'draft-1',
      p_user_id: 'user-1',
      p_crag_id: 'crag-1',
      p_latitude: 49.45,
      p_longitude: -2.55,
      p_country_code: 'GG',
      p_country_name: 'Guernsey',
      p_region_name: 'Northern Europe',
    })
    expect(supabase.rpc).not.toHaveBeenCalledWith('promote_draft_to_submission', expect.anything())
    expect(vi.mocked(notifyNewSubmission)).not.toHaveBeenCalled()
  })

  test('repairs a countryless crag when only draft-image GPS is persisted', async () => {
    const supabase = makeSupabase({ cragCountryCode: null, draftHasLocation: false })

    const response = await promoteDraftToSubmission({
      supabase: supabase as unknown as ReturnType<typeof createServerClient>,
      request: new Request('http://localhost:3000/api/submissions/drafts/draft-1/promote', { method: 'POST' }),
      draftId: 'draft-1',
      userId: 'user-1',
    })

    expect(response.status).toBe(200)
    expect(vi.mocked(resolveCountryFromCoordinates)).toHaveBeenCalledWith(supabase, 49.45, -2.55)
    expect(adminRpcMock).toHaveBeenCalledWith('repair_submission_draft_crag_country', {
      p_draft_id: 'draft-1',
      p_user_id: 'user-1',
      p_crag_id: 'crag-1',
      p_latitude: 49.45,
      p_longitude: -2.55,
      p_country_code: 'GG',
      p_country_name: 'Guernsey',
      p_region_name: 'Northern Europe',
    })
    expect(supabase.rpc).toHaveBeenCalledWith('promote_draft_to_submission', { p_draft_id: 'draft-1' })
  })

  test('recovers a submitted countryless crag using persisted draft-image GPS', async () => {
    const supabase = makeSupabase({ draftStatus: 'submitted', cragCountryCode: null, draftHasLocation: false })

    const response = await promoteDraftToSubmission({
      supabase: supabase as unknown as ReturnType<typeof createServerClient>,
      request: new Request('http://localhost:3000/api/submissions/drafts/draft-1/promote', { method: 'POST' }),
      draftId: 'draft-1',
      userId: 'user-1',
    })

    expect(response.status).toBe(200)
    expect(vi.mocked(resolveCountryFromCoordinates)).toHaveBeenCalledWith(supabase, 49.45, -2.55)
    expect(adminRpcMock).toHaveBeenCalledWith('repair_submission_draft_crag_country', expect.objectContaining({
      p_draft_id: 'draft-1',
      p_crag_id: 'crag-1',
      p_latitude: 49.45,
      p_longitude: -2.55,
    }))
    expect(supabase.rpc).not.toHaveBeenCalledWith('promote_draft_to_submission', expect.anything())
  })

  test('publishes image-only drafts when some images have no durable draft routes', async () => {
    const supabase = makeSupabase({ includeAllImageRoutes: false })

    const response = await promoteDraftToSubmission({
      supabase: supabase as unknown as ReturnType<typeof createServerClient>,
      request: new Request('http://localhost:3000/api/submissions/drafts/draft-1/promote', { method: 'POST' }),
      draftId: 'draft-1',
      userId: 'user-1',
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual(expect.objectContaining({
      published: expect.objectContaining({
        defaultImageId: 'image-1',
        routeLineIds: ['route-line-1'],
      }),
    }))
    expect(supabase.rpc).toHaveBeenCalledWith('promote_draft_to_submission', { p_draft_id: 'draft-1' })
  })

  test('publishes image-only drafts when the promotion result has no route lines', async () => {
    const supabase = makeSupabase()

    ;(supabase.rpc as unknown) = vi.fn(async (fnName: string) => {
      if (fnName === 'has_valid_open_data_consent') return { data: true, error: null }
      if (fnName === 'promote_draft_to_submission') {
        return {
          data: {
            success: true,
            status: 'submitted',
            image_id: 'image-1',
            default_image_id: 'image-1',
            image_ids: ['image-1'],
            climb_ids: [],
            route_line_ids: [],
            published_at: '2026-03-01T00:00:00Z',
          },
          error: null,
        }
      }

      return { data: null, error: null }
    })

    const response = await promoteDraftToSubmission({
      supabase: supabase as unknown as ReturnType<typeof createServerClient>,
      request: new Request('http://localhost:3000/api/submissions/drafts/draft-1/promote', { method: 'POST' }),
      draftId: 'draft-1',
      userId: 'user-1',
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual(expect.objectContaining({
      published: expect.objectContaining({
        defaultImageId: 'image-1',
        routeLineIds: [],
      }),
    }))
  })

  test('repairs missing durable routes from image route_data before publishing', async () => {
    const supabase = makeSupabase({ includeAllImageRoutes: false, includeFallbackRouteData: true })
    let draftRouteReadCount = 0
    const originalFrom = supabase.from

    ;(supabase.from as unknown) = vi.fn((table: string) => {
      if (table === 'submission_drafts') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: {
                  id: 'draft-1',
                  user_id: 'user-1',
                  crag_id: 'crag-1',
                  status: 'draft',
                  metadata: {
                    navigation: { defaultImageId: 'draft-image-1' },
                    submission: { location: { latitude: 49.45, longitude: -2.55 } },
                  },
                },
                error: null,
              })),
            })),
          })),
        }
      }

      if (table === 'submission_draft_images') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => makeThenableResult({
              data: [
                {
                  id: 'draft-image-1',
                  linked_image_id: 'image-1',
                  display_order: 0,
                  latitude: 49.45,
                  longitude: -2.55,
                  route_data: {
                    completedRoutes: [{
                      id: 'draft-route-1',
                      name: 'Recovered route',
                      grade: '6A',
                      description: '',
                      climbType: 'sport',
                      points: [{ x: 0.1, y: 0.1 }, { x: 0.2, y: 0.2 }],
                      sequenceOrder: 0,
                      imageWidth: 1200,
                      imageHeight: 1200,
                    }],
                  },
                },
                { id: 'draft-image-2', linked_image_id: 'image-2', display_order: 1, latitude: 49.46, longitude: -2.54, route_data: null },
              ],
              error: null,
            })),
          })),
        }
      }

      if (table === 'submission_draft_routes') {
        draftRouteReadCount += 1
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => makeThenableResult({
              data: draftRouteReadCount === 1
                ? [{ id: 'draft-route-2', draft_image_id: 'draft-image-2' }]
                : [
                    { id: 'draft-route-1', draft_image_id: 'draft-image-1' },
                    { id: 'draft-route-2', draft_image_id: 'draft-image-2' },
                  ],
              error: null,
            })),
          })),
        }
      }

      if (table === 'images') {
        const readyRows = [
          { id: 'image-1', processing_status: 'ready', moderation_status: 'approved', visibility: 'public', status: 'approved' },
          { id: 'image-2', processing_status: 'ready', moderation_status: 'approved', visibility: 'public', status: 'approved' },
        ]
        return {
          select: vi.fn(() => ({
            in: vi.fn(async (_column: string, ids: string[]) => ({ data: readyRows.filter((row) => ids.includes(row.id)), error: null })),
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: {
                  id: 'image-1',
                  crag_id: 'crag-1',
                  crags: { name: 'Hidden Crag', country_code: 'GG', slug: 'hidden-crag' },
                  route_lines: [
                    { id: 'route-line-1', climb_id: 'climb-1', sequence_order: 0, created_at: '2026-03-01T00:00:00Z' },
                  ],
                },
                error: null,
              })),
            })),
          })),
        }
      }

      if (table === 'climbs') {
        return {
          select: vi.fn(() => ({
            in: vi.fn(() => makeThenableResult({
              data: [
                { id: 'climb-1', name: 'Test Route', grade: '6A' },
              ],
              error: null,
            })),
          })),
        }
      }

      return originalFrom(table)
    })

    ;(supabase.rpc as unknown) = vi.fn(async (fnName: string, args?: Record<string, unknown>) => {
      if (fnName === 'has_valid_open_data_consent') return { data: true, error: null }
      if (fnName === 'sync_submission_draft_routes') {
        expect(args).toEqual(expect.objectContaining({
          p_draft_id: 'draft-1',
          p_draft_image_id: 'draft-image-1',
        }))
        return { data: { success: true }, error: null }
      }

      if (fnName === 'promote_draft_to_submission') {
        return {
          data: {
            success: true,
            status: 'submitted',
            image_id: 'image-1',
            default_image_id: 'image-1',
            image_ids: ['image-1'],
            climb_ids: ['climb-1'],
            route_line_ids: ['route-line-1'],
            published_at: '2026-03-01T00:00:00Z',
          },
          error: null,
        }
      }

      return { data: null, error: null }
    })

    const response = await promoteDraftToSubmission({
      supabase: supabase as unknown as ReturnType<typeof createServerClient>,
      request: new Request('http://localhost:3000/api/submissions/drafts/draft-1/promote', { method: 'POST' }),
      draftId: 'draft-1',
      userId: 'user-1',
    })

    expect(response.status).toBe(200)
    expect(supabase.rpc).toHaveBeenCalledWith('sync_submission_draft_routes', expect.anything())
    expect(supabase.rpc).toHaveBeenCalledWith('promote_draft_to_submission', { p_draft_id: 'draft-1' })
  })

  test('repairs draft metadata from image coordinates before publish when metadata location is missing', async () => {
    const supabase = makeSupabase() as unknown as ReturnType<typeof makeSupabase> & { from: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> }
    const originalFrom = supabase.from
    const updateMock = vi.fn(() => {
      const select = vi.fn(() => ({
        maybeSingle: vi.fn(async () => ({ data: { id: 'draft-1' }, error: null })),
      }))
      const fourthEq = vi.fn(() => ({ select }))
      const thirdEq = vi.fn(() => ({ eq: fourthEq }))
      const secondEq = vi.fn(() => ({ eq: thirdEq }))
      return { eq: vi.fn(() => ({ eq: secondEq })) }
    })

    // @ts-expect-error - mock return types are intentionally flexible
    supabase.from = vi.fn((table: string) => {
      if (table === 'submission_drafts') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: {
                  id: 'draft-1',
                  user_id: 'user-1',
                  crag_id: 'crag-1',
                  status: 'draft',
                  updated_at: '2026-03-01T00:00:00Z',
                  metadata: {
                    navigation: { defaultImageId: 'draft-image-1' },
                    submission: {},
                  },
                },
                error: null,
              })),
            })),
          })),
          update: updateMock,
        }
      }

      if (table === 'submission_draft_images') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => makeThenableResult({
              data: [
                {
                  id: 'draft-image-1',
                  linked_image_id: 'image-1',
                  display_order: 0,
                  latitude: 49.45,
                  longitude: -2.55,
                  route_data: null,
                },
              ],
              error: null,
            })),
          })),
        }
      }

      if (table === 'submission_draft_routes') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => makeThenableResult({
              data: [{ id: 'draft-route-1', draft_image_id: 'draft-image-1' }],
              error: null,
            })),
          })),
        }
      }

      return originalFrom(table)
    })

    const response = await promoteDraftToSubmission({
      supabase: supabase as unknown as ReturnType<typeof createServerClient>,
      request: new Request('http://localhost:3000/api/submissions/drafts/draft-1/promote', { method: 'POST' }),
      draftId: 'draft-1',
      userId: 'user-1',
    })

    expect(response.status).toBe(200)
    expect(updateMock).toHaveBeenCalledWith({
      metadata: {
        navigation: { defaultImageId: 'draft-image-1' },
        submission: { location: { latitude: 49.45, longitude: -2.55 } },
      },
    })
    expect(supabase.rpc).toHaveBeenCalledWith('promote_draft_to_submission', { p_draft_id: 'draft-1' })
  })

  test('logs draft route repair failures and still publishes', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const supabase = makeSupabase({ includeAllImageRoutes: false, includeFallbackRouteData: true })

    ;(supabase.rpc as unknown) = vi.fn(async (fnName: string) => {
      if (fnName === 'has_valid_open_data_consent') return { data: true, error: null }
      if (fnName === 'sync_submission_draft_routes') {
        return { data: null, error: { message: 'routes payload malformed' } }
      }

      if (fnName === 'promote_draft_to_submission') {
        return {
          data: {
            success: true,
            status: 'submitted',
            image_id: 'image-1',
            default_image_id: 'image-1',
            image_ids: ['image-1'],
            climb_ids: ['climb-1'],
            route_line_ids: ['route-line-1'],
            published_at: '2026-03-01T00:00:00Z',
          },
          error: null,
        }
      }

      return { data: null, error: null }
    })

    const response = await promoteDraftToSubmission({
      supabase: supabase as unknown as ReturnType<typeof createServerClient>,
      request: new Request('http://localhost:3000/api/submissions/drafts/draft-1/promote', { method: 'POST' }),
      draftId: 'draft-1',
      userId: 'user-1',
    })

    expect(response.status).toBe(200)
    expect(supabase.rpc).toHaveBeenCalledWith('sync_submission_draft_routes', expect.anything())
    expect(supabase.rpc).toHaveBeenCalledWith('promote_draft_to_submission', { p_draft_id: 'draft-1' })
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining('Failed to repair draft routes before publish'),
      expect.any(Error),
      expect.objectContaining({ draftId: 'draft-1', imageId: 'draft-image-1', routeCount: 1 })
    )

    consoleError.mockRestore()
  })

  test('rejects custom image location without coordinates before publish', async () => {
    const supabase = makeSupabase() as unknown as ReturnType<typeof makeSupabase> & { from: ReturnType<typeof vi.fn> }
    const originalFrom = supabase.from

    Object.defineProperty(supabase, 'from', { value: vi.fn((table: string) => {
      if (table === 'submission_drafts') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: {
                  id: 'draft-1',
                  user_id: 'user-1',
                  crag_id: 'crag-1',
                  status: 'draft',
                  metadata: {
                    version: 2,
                    navigation: { defaultImageId: 'draft-image-1' },
                    images: {
                      'draft-image-1': { imageId: 'draft-image-1', displayOrder: 0, locationMode: 'custom' },
                    },
                    submission: { location: { latitude: 49.45, longitude: -2.55 } },
                  },
                },
                error: null,
              })),
            })),
          })),
        }
      }

      if (table === 'submission_draft_images') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => makeThenableResult({
              data: [
                {
                  id: 'draft-image-1',
                  linked_image_id: 'image-1',
                  display_order: 0,
                  latitude: null,
                  longitude: null,
                  route_data: null,
                },
              ],
              error: null,
            })),
          })),
        }
      }

      return originalFrom(table)
    }) })

    const response = await promoteDraftToSubmission({
      supabase: supabase as unknown as ReturnType<typeof createServerClient>,
      request: new Request('http://localhost:3000/api/submissions/drafts/draft-1/promote', { method: 'POST' }),
      draftId: 'draft-1',
      userId: 'user-1',
    })

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: 'Add location for Image 1 before publishing this draft' })
    expect(supabase.rpc).not.toHaveBeenCalledWith('promote_draft_to_submission', expect.anything())
  })
})
