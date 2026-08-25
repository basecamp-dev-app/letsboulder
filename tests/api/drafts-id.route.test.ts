import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { createServerClient } from '@supabase/ssr'

const { createErrorResponse } = vi.hoisted(() => ({
  createErrorResponse: vi.fn((_error: unknown, message: string) =>
    new Response(JSON.stringify({ error: message }), { status: 500 })
  ),
}))

const { cleanupDraftStorageObjects } = vi.hoisted(() => ({
  cleanupDraftStorageObjects: vi.fn(async () => undefined),
}))

const { parseWithSchema } = vi.hoisted(() => ({
  parseWithSchema: vi.fn(),
}))

const { withApiMiddleware } = vi.hoisted(() => ({
  withApiMiddleware: vi.fn(),
}))

const { getServerClientFromRequest, getAdminClient, getAdminClientWithAudit } = vi.hoisted(() => ({
  getServerClientFromRequest: vi.fn(),
  getAdminClient: vi.fn(),
  getAdminClientWithAudit: vi.fn(),
}))

const { resolveUserIdWithFallback } = vi.hoisted(() => ({
  resolveUserIdWithFallback: vi.fn(),
}))

vi.mock('@/lib/errors', () => ({
  createErrorResponse,
}))

vi.mock('@/lib/media/draft-storage', () => ({
  cleanupDraftStorageObjects,
}))

vi.mock('@/lib/api-validation', () => ({
  parseWithSchema,
}))

vi.mock('@/lib/csrf-server', () => ({
  withApiMiddleware,
}))

vi.mock('@/lib/supabase-server', () => ({
  getServerClientFromRequest,
  getAdminClient,
}))

vi.mock('@/lib/supabase-admin', () => ({
  getAdminClientWithAudit,
}))

vi.mock('@/lib/auth-context', () => ({
  resolveUserIdWithFallback,
}))

import { DELETE, GET, PATCH } from '@/app/api/submissions/drafts/[id]/route'

type MiddlewareResult = Awaited<ReturnType<typeof withApiMiddleware>>

function makeThenableResult<T>(result: T) {
  return {
    then: (onFulfilled?: (value: T) => unknown, onRejected?: (reason: unknown) => unknown) =>
      Promise.resolve(result).then(onFulfilled, onRejected),
    catch: (onRejected?: (reason: unknown) => unknown) => Promise.resolve(result).catch(onRejected),
    finally: (onFinally?: () => void) => Promise.resolve(result).finally(onFinally),
  }
}

function makeRequest(url: string, options: { method?: string; body?: string } = {}) {
  return new NextRequest(url, {
    method: options.method || 'GET',
    headers: options.body ? { 'content-type': 'application/json' } : undefined,
    body: options.body,
  })
}

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) }
}

function makeSupabaseClient() {
  return {
    auth: {
      getUser: vi.fn(async () => ({ data: { user: null }, error: null })),
    },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(async () => ({ data: null, error: null })),
          single: vi.fn(async () => ({ data: null, error: null })),
          order: vi.fn(() => ({
            order: vi.fn(() => ({
              order: vi.fn(async () => ({ data: [], error: null })),
            })),
          })),
        })),
      })),
      delete: vi.fn(() => ({
        eq: vi.fn(() => ({
          select: vi.fn(async () => ({ data: null, error: null })),
        })),
      })),
      update: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            select: vi.fn(async () => ({ data: null, error: null })),
          })),
        })),
      })),
      insert: vi.fn(async () => ({ data: null, error: null })),
    })),
    rpc: vi.fn(async () => ({ data: null, error: null })),
  }
}

const DRAFT_BASE = {
  id: 'draft-1',
  user_id: 'user-1',
  crag_id: 'crag-1',
  status: 'draft',
  metadata: { location: { latitude: 49.45, longitude: -2.55 } },
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  last_edited_by: null,
  crags: { name: 'Test Crag', latitude: 49.45, longitude: -2.55 },
}

const DRAFT_IMAGE_BASE = {
  id: 'draft-image-1',
  draft_id: 'draft-1',
  display_order: 0,
  storage_bucket: 'private-bucket',
  storage_path: 'drafts/draft-1/image-1.jpg',
  width: 1200,
  height: 800,
  route_data: null,
  latitude: 49.45,
  longitude: -2.55,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  processing_status: 'ready',
  preview_variants: null,
}

type DraftFixture = Omit<typeof DRAFT_BASE, 'last_edited_by'> & { last_edited_by: string | null }

function makeSupabaseWithDraft(draft: DraftFixture, options?: { images?: unknown[]; routes?: unknown[]; profile?: unknown }) {
  const images = options?.images ?? [DRAFT_IMAGE_BASE]
  const routes = options?.routes ?? []

  return {
    auth: {
      getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } }, error: null })),
    },
    from: vi.fn((table: string) => {
      if (table === 'submission_drafts') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({ data: draft, error: null })),
              single: vi.fn(async () => ({ data: draft, error: null })),
            })),
          })),
          delete: vi.fn(() => ({
            eq: vi.fn(() => ({
              select: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({ data: { id: draft.id }, error: null })),
              })),
            })),
          })),
          update: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                select: vi.fn(async () => ({ data: { updated_at: draft.updated_at }, error: null })),
              })),
            })),
          })),
        }
      }

      if (table === 'submission_draft_images') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              order: vi.fn(() => makeThenableResult({ data: images, error: null })),
            })),
          })),
        }
      }

      if (table === 'submission_draft_routes') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              order: vi.fn(() => ({
                order: vi.fn(() => ({
                  order: vi.fn(async () => makeThenableResult({ data: routes, error: null })),
                })),
              })),
            })),
          })),
        }
      }

      if (table === 'submission_draft_collaborators') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({ data: null, error: null })),
              })),
            })),
          })),
        }
      }

      if (table === 'profiles') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({ data: options?.profile ?? null, error: null })),
            })),
          })),
        }
      }

      if (table === 'crags') {
        const builder = {
          eq: vi.fn(() => builder),
          is: vi.fn(() => builder),
          maybeSingle: vi.fn(async () => ({ data: { id: 'crag-1' }, error: null })),
        }
        return { select: vi.fn(() => builder) }
      }

      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({ data: null, error: null })),
          })),
        })),
      }
    }),
    rpc: vi.fn(async () => ({
      data: {
        draft_id: draft.id,
        updated_at: draft.updated_at,
        updated_count: 1,
        images: [],
      },
      error: null,
    })),
  }
}

function makeAuthenticatedMiddleware(supabase: unknown, userId: string) {
  return {
    ok: true,
    supabase,
    userId,
  } as MiddlewareResult
}

function makeUnauthenticatedMiddleware() {
  return {
    ok: false,
    response: new Response(JSON.stringify({ error: 'Authentication required' }), { status: 401 }),
  } as MiddlewareResult
}

describe('/api/submissions/drafts/[id]', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  describe('GET', () => {
    test('returns 400 when draft ID is missing', async () => {
      const response = await GET(makeRequest('http://localhost:3000/api/submissions/drafts/'), makeParams(''))

      expect(response.status).toBe(400)
      await expect(response.json()).resolves.toEqual({ error: 'Draft ID is required' })
    })

    test('returns 401 when unauthenticated', async () => {
      vi.mocked(resolveUserIdWithFallback).mockResolvedValue({ userId: null, authError: new Error('No session') })
      vi.mocked(getServerClientFromRequest).mockReturnValue(makeSupabaseClient())

      const response = await GET(makeRequest('http://localhost:3000/api/submissions/drafts/draft-1'), makeParams('draft-1'))

      expect(response.status).toBe(401)
    })

    test('returns 404 when draft does not exist', async () => {
      const supabase = makeSupabaseClient()
      vi.mocked(resolveUserIdWithFallback).mockResolvedValue({ userId: 'user-1', authError: null })
      vi.mocked(getServerClientFromRequest).mockReturnValue(supabase)

      const draftSelect = vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(async () => ({ data: null, error: null })),
        })),
      }))
      vi.mocked(supabase.from).mockReturnValue({
        select: draftSelect,
      } as unknown as ReturnType<typeof supabase.from>)

      const response = await GET(makeRequest('http://localhost:3000/api/submissions/drafts/draft-1'), makeParams('draft-1'))

      expect(response.status).toBe(404)
    })

    test('returns 200 with draft data and isOwner true for owner', async () => {
      const supabase = makeSupabaseWithDraft(DRAFT_BASE)
      vi.mocked(resolveUserIdWithFallback).mockResolvedValue({ userId: 'user-1', authError: null })
      vi.mocked(getServerClientFromRequest).mockReturnValue(supabase)

      const response = await GET(makeRequest('http://localhost:3000/api/submissions/drafts/draft-1'), makeParams('draft-1'))
      const json = await response.json()

      expect(response.status).toBe(200)
      expect(json.draft.id).toBe('draft-1')
      expect(json.isOwner).toBe(true)
      expect(json.draft.images).toHaveLength(1)
      expect(json.draft.images[0].storage_bucket).toBeTruthy()
      expect(json.draft.images[0].storage_path).toBeTruthy()
      expect(json.draft.images[0].readiness_status).toBe('ready')
    })

    test('hydrates completedRoutes exclusively from durable draft routes', async () => {
      const supabase = makeSupabaseWithDraft(DRAFT_BASE, {
        images: [{
          ...DRAFT_IMAGE_BASE,
          route_data: { completedRoutes: [{ id: 'stale-route' }], editorScale: 1.5 },
        }],
        routes: [{
          id: 'durable-route',
          draft_image_id: 'draft-image-1',
          name: 'Durable route',
          grade: '6A',
          description: null,
          climb_type: 'sport',
          points: [{ x: 0.1, y: 0.2 }, { x: 0.3, y: 0.4 }],
          sequence_order: 0,
          image_width: 1200,
          image_height: 800,
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        }],
      })
      vi.mocked(resolveUserIdWithFallback).mockResolvedValue({ userId: 'user-1', authError: null })
      vi.mocked(getServerClientFromRequest).mockReturnValue(supabase)

      const response = await GET(makeRequest('http://localhost:3000/api/submissions/drafts/draft-1'), makeParams('draft-1'))
      const json = await response.json()

      expect(json.draft.images[0].route_data).toEqual({
        editorScale: 1.5,
        completedRoutes: [expect.objectContaining({ id: 'durable-route', name: 'Durable route' })],
      })
    })

    test('hydrates completedRoutes as empty when no durable routes exist', async () => {
      const supabase = makeSupabaseWithDraft(DRAFT_BASE, {
        images: [{ ...DRAFT_IMAGE_BASE, route_data: { completedRoutes: [{ id: 'stale-route' }], editorScale: 1.5 } }],
      })
      vi.mocked(resolveUserIdWithFallback).mockResolvedValue({ userId: 'user-1', authError: null })
      vi.mocked(getServerClientFromRequest).mockReturnValue(supabase)

      const response = await GET(makeRequest('http://localhost:3000/api/submissions/drafts/draft-1'), makeParams('draft-1'))
      const json = await response.json()

      expect(json.draft.images[0].route_data).toEqual({ editorScale: 1.5, completedRoutes: [] })
    })

    test('returns isOwner false for collaborator', async () => {
      const supabase = makeSupabaseWithDraft(DRAFT_BASE)
      vi.mocked(resolveUserIdWithFallback).mockResolvedValue({ userId: 'user-2', authError: null })
      vi.mocked(getServerClientFromRequest).mockReturnValue(supabase)

      const response = await GET(makeRequest('http://localhost:3000/api/submissions/drafts/draft-1'), makeParams('draft-1'))
      const json = await response.json()

      expect(response.status).toBe(200)
      expect(json.isOwner).toBe(false)
    })
  })

  describe('PATCH', () => {
    test('returns 401 when unauthenticated', async () => {
      vi.mocked(withApiMiddleware).mockResolvedValue(makeUnauthenticatedMiddleware())

      const response = await PATCH(
        makeRequest('http://localhost:3000/api/submissions/drafts/draft-1', { method: 'PATCH' }),
        makeParams('draft-1')
      )

      expect(response.status).toBe(401)
    })

    test('returns 400 when draft ID is missing', async () => {
      const supabase = makeSupabaseClient()
      vi.mocked(withApiMiddleware).mockResolvedValue(makeAuthenticatedMiddleware(supabase, 'user-1'))

      const response = await PATCH(
        makeRequest('http://localhost:3000/api/submissions/drafts/', { method: 'PATCH' }),
        makeParams('')
      )

      expect(response.status).toBe(400)
    })

    test('returns 400 when body is invalid', async () => {
      const supabase = makeSupabaseClient()
      vi.mocked(withApiMiddleware).mockResolvedValue(makeAuthenticatedMiddleware(supabase, 'user-1'))
      vi.mocked(parseWithSchema).mockReturnValue({ success: false, response: new Response(JSON.stringify({ error: 'Invalid' }), { status: 400 }) })

      const response = await PATCH(
        makeRequest('http://localhost:3000/api/submissions/drafts/draft-1', {
          method: 'PATCH',
          body: JSON.stringify({ invalid: true }),
        }),
        makeParams('draft-1')
      )

      expect(response.status).toBe(400)
    })

    test('returns 404 when draft does not exist', async () => {
      const supabase = makeSupabaseClient()
      vi.mocked(withApiMiddleware).mockResolvedValue(makeAuthenticatedMiddleware(supabase, 'user-1'))
      vi.mocked(parseWithSchema).mockReturnValue({
        success: true,
        data: {
          images: [{ id: 'img-1', display_order: 0, route_data: {} }],
          expected_updated_at: '2026-01-01T00:00:00Z',
        },
      })

      const draftSelect = vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(async () => ({ data: null, error: null })),
        })),
      }))
      vi.mocked(supabase.from).mockReturnValue({
        select: draftSelect,
      } as unknown as ReturnType<typeof supabase.from>)

      const response = await PATCH(
        makeRequest('http://localhost:3000/api/submissions/drafts/draft-1', {
          method: 'PATCH',
          body: JSON.stringify({
            images: [{ id: 'img-1', display_order: 0, route_data: {} }],
            expected_updated_at: '2026-01-01T00:00:00Z',
          }),
        }),
        makeParams('draft-1')
      )

      expect(response.status).toBe(404)
    })

    test('returns 403 when non-owner without collaborator access', async () => {
      const supabase = makeSupabaseWithDraft(DRAFT_BASE)
      vi.mocked(withApiMiddleware).mockResolvedValue(makeAuthenticatedMiddleware(supabase, 'user-2'))
      vi.mocked(parseWithSchema).mockReturnValue({
        success: true,
        data: {
          images: [{ id: 'img-1', display_order: 0, route_data: {} }],
          expected_updated_at: '2026-01-01T00:00:00Z',
        },
      })

      const response = await PATCH(
        makeRequest('http://localhost:3000/api/submissions/drafts/draft-1', {
          method: 'PATCH',
          body: JSON.stringify({
            images: [{ id: 'img-1', display_order: 0, route_data: {} }],
            expected_updated_at: '2026-01-01T00:00:00Z',
          }),
        }),
        makeParams('draft-1')
      )

      expect(response.status).toBe(403)
    })

    test('returns 400 when draft is not in draft status', async () => {
      const submittedDraft = { ...DRAFT_BASE, status: 'submitted' }
      const supabase = makeSupabaseWithDraft(submittedDraft)
      vi.mocked(withApiMiddleware).mockResolvedValue(makeAuthenticatedMiddleware(supabase, 'user-1'))
      vi.mocked(parseWithSchema).mockReturnValue({
        success: true,
        data: {
          images: [{ id: 'img-1', display_order: 0, route_data: {} }],
          expected_updated_at: '2026-01-01T00:00:00Z',
        },
      })

      const response = await PATCH(
        makeRequest('http://localhost:3000/api/submissions/drafts/draft-1', {
          method: 'PATCH',
          body: JSON.stringify({
            images: [{ id: 'img-1', display_order: 0, route_data: {} }],
            expected_updated_at: '2026-01-01T00:00:00Z',
          }),
        }),
        makeParams('draft-1')
      )

      expect(response.status).toBe(400)
    })

    test('returns 409 conflict when expected_updated_at is stale', async () => {
      const draftWithNewerUpdate = { ...DRAFT_BASE, updated_at: '2026-01-02T00:00:00Z' }
      const supabase = makeSupabaseWithDraft(draftWithNewerUpdate)
      vi.mocked(withApiMiddleware).mockResolvedValue(makeAuthenticatedMiddleware(supabase, 'user-1'))
      vi.mocked(parseWithSchema).mockReturnValue({
        success: true,
        data: {
          images: [{ id: 'img-1', display_order: 0, route_data: {} }],
          expected_updated_at: '2026-01-01T00:00:00Z',
        },
      })

      const response = await PATCH(
        makeRequest('http://localhost:3000/api/submissions/drafts/draft-1', {
          method: 'PATCH',
          body: JSON.stringify({
            images: [{ id: 'img-1', display_order: 0, route_data: {} }],
            expected_updated_at: '2026-01-01T00:00:00Z',
          }),
        }),
        makeParams('draft-1')
      )

      expect(response.status).toBe(409)
      const json = await response.json()
      expect(json.code).toBe('draft_conflict')
      expect(json.current_updated_at).toBe('2026-01-02T00:00:00Z')
    })

    test('returns 200 on successful patch', async () => {
      const supabase = makeSupabaseWithDraft(DRAFT_BASE)
      vi.mocked(withApiMiddleware).mockResolvedValue(makeAuthenticatedMiddleware(supabase, 'user-1'))
      vi.mocked(parseWithSchema).mockReturnValue({
        success: true,
        data: {
          images: [{ id: 'img-1', display_order: 0, route_data: {} }],
          expected_updated_at: '2026-01-01T00:00:00Z',
        },
      })

      const response = await PATCH(
        makeRequest('http://localhost:3000/api/submissions/drafts/draft-1', {
          method: 'PATCH',
          body: JSON.stringify({
            images: [{ id: 'img-1', display_order: 0, route_data: {} }],
            expected_updated_at: '2026-01-01T00:00:00Z',
          }),
        }),
        makeParams('draft-1')
      )

      expect(response.status).toBe(200)
      const json = await response.json()
      expect(json.success).toBe(true)
      expect(supabase.rpc).toHaveBeenCalledWith('patch_submission_draft_images_atomic', {
        p_draft_id: 'draft-1',
        p_images: [{ id: 'img-1', display_order: 0, route_data: {} }],
        p_expected_updated_at: '2026-01-01T00:00:00Z',
      })
    })

    test('saves images, routes, metadata, and crag with one atomic RPC', async () => {
      const supabase = makeSupabaseWithDraft(DRAFT_BASE)
      vi.mocked(withApiMiddleware).mockResolvedValue(makeAuthenticatedMiddleware(supabase, 'user-1'))
      vi.mocked(parseWithSchema).mockReturnValue({
        success: true,
        data: {
          images: [{ id: 'draft-image-1', display_order: 0, route_data: { complete: true } }],
          routeSets: [{ draftImageId: 'draft-image-1', routes: [{ id: 'route-1', name: 'Route', grade: 'V3', climbType: 'boulder', points: [{ x: 1, y: 2 }], sequenceOrder: 0 }] }],
          metadata: { version: 2 },
          cragId: null,
          expected_updated_at: DRAFT_BASE.updated_at,
        },
      })

      const response = await PATCH(makeRequest('http://localhost:3000/api/submissions/drafts/draft-1', { method: 'PATCH', body: '{}' }), makeParams('draft-1'))

      expect(response.status).toBe(200)
      expect(supabase.rpc).toHaveBeenCalledTimes(1)
      expect(supabase.rpc).toHaveBeenCalledWith('save_submission_draft_atomic', {
        p_draft_id: 'draft-1',
        p_expected_updated_at: DRAFT_BASE.updated_at,
        p_images: [{ id: 'draft-image-1', display_order: 0, route_data: { complete: true } }],
        p_route_sets: [{ draftImageId: 'draft-image-1', routes: [{ id: 'route-1', name: 'Route', grade: 'V3', description: null, climbType: 'boulder', points: [{ x: 1, y: 2 }], sequenceOrder: 0, imageWidth: null, imageHeight: null }] }],
        p_metadata: { version: 2 },
      })
    })

    test('returns the exact enriched conflict response from an atomic save', async () => {
      const currentDraft = { ...DRAFT_BASE, updated_at: '2026-01-02T00:00:00Z', last_edited_by: 'user-2' }
      const supabase = makeSupabaseWithDraft(currentDraft, { profile: { id: 'user-2', username: 'alex', display_name: 'Alex Climber' } })
      vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: { message: 'Draft conflict', details: 'draft_conflict' } } as never)
      vi.mocked(withApiMiddleware).mockResolvedValue(makeAuthenticatedMiddleware(supabase, 'user-1'))
      vi.mocked(parseWithSchema).mockReturnValue({
        success: true,
        data: {
          images: [{ id: 'draft-image-1', display_order: 0, route_data: {} }],
          routeSets: [],
          metadata: {},
          cragId: 'crag-1',
          expected_updated_at: DRAFT_BASE.updated_at,
        },
      })

      const response = await PATCH(makeRequest('http://localhost:3000/api/submissions/drafts/draft-1', { method: 'PATCH', body: '{}' }), makeParams('draft-1'))

      expect(response.status).toBe(409)
      await expect(response.json()).resolves.toEqual({
        code: 'draft_conflict',
        message: 'This draft was updated by another collaborator. Reload to continue editing.',
        current_updated_at: currentDraft.updated_at,
        current_data: { updated_at: currentDraft.updated_at, last_updated_by: 'user-2', last_updated_by_display_name: 'Alex Climber' },
      })
      expect(supabase.rpc).toHaveBeenCalledTimes(1)
    })

    test('rejects malformed atomic route points before calling the RPC', async () => {
      const supabase = makeSupabaseWithDraft(DRAFT_BASE)
      vi.mocked(withApiMiddleware).mockResolvedValue(makeAuthenticatedMiddleware(supabase, 'user-1'))
      vi.mocked(parseWithSchema).mockReturnValue({
        success: true,
        data: {
          images: [{ id: 'draft-image-1', display_order: 0, route_data: {} }],
          routeSets: [{ draftImageId: 'draft-image-1', routes: [{ id: 'route-1', name: 'Route', grade: 'V3', climbType: 'boulder', points: [null, null], sequenceOrder: 0 }] }],
          metadata: {},
          cragId: 'crag-1',
          expected_updated_at: DRAFT_BASE.updated_at,
        },
      })

      const response = await PATCH(makeRequest('http://localhost:3000/api/submissions/drafts/draft-1', { method: 'PATCH', body: '{}' }), makeParams('draft-1'))

      expect(response.status).toBe(400)
      expect(supabase.rpc).not.toHaveBeenCalled()
    })
  })

  describe('DELETE', () => {
    test('returns 401 when unauthenticated', async () => {
      vi.mocked(withApiMiddleware).mockResolvedValue(makeUnauthenticatedMiddleware())

      const response = await DELETE(
        makeRequest('http://localhost:3000/api/submissions/drafts/draft-1', { method: 'DELETE' }),
        makeParams('draft-1')
      )

      expect(response.status).toBe(401)
    })

    test('returns 400 when draft ID is missing', async () => {
      const supabase = makeSupabaseClient()
      vi.mocked(withApiMiddleware).mockResolvedValue(makeAuthenticatedMiddleware(supabase, 'user-1'))

      const response = await DELETE(
        makeRequest('http://localhost:3000/api/submissions/drafts/', { method: 'DELETE' }),
        makeParams('')
      )

      expect(response.status).toBe(400)
    })

    test.each([
      ['not_found', 404, 'Draft not found'],
      ['permission_denied', 403, 'Forbidden'],
      ['draft_not_editable', 409, 'Only draft submissions can be deleted'],
      ['draft_conflict', 409, 'The draft changed while it was being deleted'],
    ])('maps RPC detail %s to %s', async (details, status, message) => {
      const supabase = makeSupabaseClient()
      vi.mocked(supabase.rpc).mockResolvedValue({
        data: null,
        error: { message, details },
      } as never)
      vi.mocked(withApiMiddleware).mockResolvedValue(makeAuthenticatedMiddleware(supabase, 'user-1'))

      const response = await DELETE(
        makeRequest('http://localhost:3000/api/submissions/drafts/draft-1', { method: 'DELETE' }),
        makeParams('draft-1')
      )

      expect(response.status).toBe(status)
      await expect(response.json()).resolves.toEqual({ error: message })
      expect(supabase.rpc).toHaveBeenCalledWith('delete_submission_draft_atomic', {
        p_draft_id: 'draft-1',
      })
      expect(cleanupDraftStorageObjects).not.toHaveBeenCalled()
    })

    test('returns 200 and cleans returned storage rows only after the atomic RPC', async () => {
      const supabase = makeSupabaseClient()
      vi.mocked(supabase.rpc).mockResolvedValue({
        data: {
          success: true,
          cleanup: [{
            storage_provider: 'r2',
            storage_bucket: 'private-bucket',
            storage_path: 'drafts/draft-1/image-1.jpg',
          }],
        },
        error: null,
      } as never)
      vi.mocked(withApiMiddleware).mockResolvedValue(makeAuthenticatedMiddleware(supabase, 'user-1'))
      const admin = {} as ReturnType<typeof createServerClient>
      vi.mocked(getAdminClientWithAudit).mockReturnValue(admin)

      const response = await DELETE(
        makeRequest('http://localhost:3000/api/submissions/drafts/draft-1', { method: 'DELETE' }),
        makeParams('draft-1')
      )

      expect(response.status).toBe(200)
      const json = await response.json()
      expect(json.success).toBe(true)
      expect(supabase.rpc).toHaveBeenCalledWith('delete_submission_draft_atomic', {
        p_draft_id: 'draft-1',
      })
      expect(cleanupDraftStorageObjects).toHaveBeenCalledWith(admin, [{
        storage_provider: 'r2',
        storage_bucket: 'private-bucket',
        storage_path: 'drafts/draft-1/image-1.jpg',
      }])
      expect(supabase.rpc.mock.invocationCallOrder[0]).toBeLessThan(
        cleanupDraftStorageObjects.mock.invocationCallOrder[0]
      )
    })
  })
})
