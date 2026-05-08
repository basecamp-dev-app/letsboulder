import { describe, expect, test, vi } from 'vitest'
import { createServerClient } from '@supabase/ssr'

const mockServerEnv = vi.hoisted(() => ({
  INTERNAL_MODERATION_SECRET: 'test-moderation-secret',
}))

vi.mock('@/lib/env.server', () => ({
  serverEnv: mockServerEnv,
  getServerEnv: () => mockServerEnv,
}))

vi.mock('@/lib/discord', () => ({
  notifyNewSubmission: vi.fn(async () => undefined),
}))

vi.mock('@/lib/media/config', () => ({
  getMediaModerationConfig: vi.fn(() => ({ enabled: false })),
}))

import { promoteDraftToSubmission } from '@/features/submissions/server/drafts/draft-promote'
import { notifyNewSubmission } from '@/lib/discord'

function makeThenableResult<T>(result: T) {
  return {
    then: (onFulfilled?: (value: T) => unknown, onRejected?: (reason: unknown) => unknown) =>
      Promise.resolve(result).then(onFulfilled, onRejected),
    catch: (onRejected?: (reason: unknown) => unknown) => Promise.resolve(result).catch(onRejected),
    finally: (onFinally?: () => void) => Promise.resolve(result).finally(onFinally),
  }
}

function makeSupabase(options?: { includeAllImageRoutes?: boolean; includeFallbackRouteData?: boolean }) {
  const includeAllImageRoutes = options?.includeAllImageRoutes ?? true
  const includeFallbackRouteData = options?.includeFallbackRouteData ?? false

  return {
    from: vi.fn((table: string) => {
      if (table === 'submission_drafts') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: {
                  id: 'draft-1',
                  user_id: 'user-1',
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
                { id: 'draft-image-2', display_order: 1, latitude: 49.46, longitude: -2.54, route_data: null },
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
        return {
          select: vi.fn(() => ({
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

    supabase.from = vi.fn((table: string) => {
      if (table === 'submission_drafts') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: {
                  id: 'draft-1',
                  user_id: 'user-1',
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
                { id: 'draft-image-2', display_order: 1, latitude: 49.46, longitude: -2.54, route_data: null },
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
        return {
          select: vi.fn(() => ({
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
    })

    ;(supabase.rpc as unknown) = vi.fn(async (fnName: string, args?: Record<string, unknown>) => {
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
    const updateMock = vi.fn(() => ({
      eq: vi.fn(() => ({
        eq: vi.fn(async () => ({ data: null, error: null })),
      })),
    }))

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
