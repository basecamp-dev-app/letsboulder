import { NextRequest } from 'next/server'
import { describe, expect, test, vi } from 'vitest'
import { createServerClient } from '@supabase/ssr'

const mockServerEnv = vi.hoisted(() => ({}))

vi.mock('@/lib/env.server', () => ({
  serverEnv: mockServerEnv,
  getServerEnv: () => mockServerEnv,
}))

const middlewareSupabaseStub = {} as Awaited<ReturnType<typeof withApiMiddleware>> extends { ok: true; supabase: infer TSupabase }
  ? TSupabase
  : never

vi.mock('@/lib/csrf-server', () => ({
  withCsrfProtection: vi.fn(async () => ({ valid: true, response: null })),
  withApiMiddleware: vi.fn(async () => ({
    ok: true,
    supabase: middlewareSupabaseStub,
    userId: null,
  })),
}))

vi.mock('@/lib/discord', () => ({
  notifyNewSubmission: vi.fn(async () => undefined),
}))

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}))

import { POST } from '@/app/api/submissions/route'
import { withApiMiddleware } from '@/lib/csrf-server'

function makeThenableResult<T>(result: T) {
  return {
    then: (onFulfilled?: (value: T) => unknown, onRejected?: (reason: unknown) => unknown) =>
      Promise.resolve(result).then(onFulfilled, onRejected),
    catch: (onRejected?: (reason: unknown) => unknown) => Promise.resolve(result).catch(onRejected),
    finally: (onFinally?: () => void) => Promise.resolve(result).finally(onFinally),
  }
}

function makeSubmissionRequest(body: unknown) {
  return new NextRequest('http://localhost:3000/api/submissions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-csrf-token': 'test-csrf-token',
    },
    body: JSON.stringify(body),
  })
}

describe('POST /api/submissions', () => {
  test('returns 401 when session is missing', async () => {
    vi.mocked(withApiMiddleware).mockResolvedValueOnce({
      ok: true,
      supabase: middlewareSupabaseStub,
      userId: null,
    })
    globalThis.__setSupabaseGetUserResponse({ user: null, error: null })

    const request = makeSubmissionRequest({
      mode: 'existing',
      imageId: 'image-1',
      routes: [],
    })

    const response = await POST(request)
    const json = await response.json()

    expect(response.status).toBe(401)
    expect(json.error).toBe('Authentication required')
  })

  test('returns 400 for malformed payload via grade and points validation', async () => {
    vi.mocked(withApiMiddleware).mockResolvedValueOnce({
      ok: true,
      supabase: middlewareSupabaseStub,
      userId: null,
    })
    globalThis.__setSupabaseGetUserResponse({ user: { id: 'user-1' }, error: null })

    const invalidGradeRequest = makeSubmissionRequest({
      mode: 'existing',
      imageId: 'image-1',
      routes: [
        {
          id: 'route-1',
          name: 'Invalid Grade Route',
          grade: 'V0',
          points: [
            { x: 10, y: 20 },
            { x: 30, y: 40 },
          ],
          sequenceOrder: 0,
          imageWidth: 100,
          imageHeight: 100,
          imageNaturalWidth: 100,
          imageNaturalHeight: 100,
        },
      ],
    })

    const invalidGradeResponse = await POST(invalidGradeRequest)
    const invalidGradeJson = await invalidGradeResponse.json()

    expect(invalidGradeResponse.status).toBe(400)
    expect(invalidGradeJson.error).toBe('Invalid request data')
    expect(invalidGradeJson.fieldErrors.routes?.[0]).toContain('Invalid grade')

    const invalidPointsRequest = makeSubmissionRequest({
      mode: 'existing',
      imageId: 'image-1',
      routes: [
        {
          id: 'route-2',
          name: 'Invalid Points Route',
          grade: '6A',
          points: [{ x: 10, y: 20 }],
          sequenceOrder: 0,
          imageWidth: 100,
          imageHeight: 100,
          imageNaturalWidth: 100,
          imageNaturalHeight: 100,
        },
      ],
    })

    const invalidPointsResponse = await POST(invalidPointsRequest)
    const invalidPointsJson = await invalidPointsResponse.json()

    expect(invalidPointsResponse.status).toBe(400)
    expect(invalidPointsJson.error).toBe('Invalid request data')
    expect(invalidPointsJson.fieldErrors.routes?.[0]).toContain('at least 2 points')
  })

  test('returns 200 and success payload for valid existing-image submission', async () => {
    vi.mocked(withApiMiddleware).mockResolvedValueOnce({
      ok: true,
      supabase: middlewareSupabaseStub,
      userId: null,
    })
    globalThis.__setSupabaseGetUserResponse({ user: { id: 'user-happy-path' }, error: null })

    const submissionsInsert = vi.fn(() =>
      makeThenableResult({ data: { id: 'test-uuid' }, error: null })
    )

    const fromMock = vi.fn((table: string) => {
      if (table === 'climbs') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                gte: vi.fn(() => makeThenableResult({ data: null, error: null, count: 0 })),
              })),
            })),
          })),
        }
      }

      if (table === 'images') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(async () => ({ data: { id: 'image-1', crag_id: null, processing_status: 'ready', moderation_status: 'approved', visibility: 'public', status: 'approved' }, error: null })),
              maybeSingle: vi.fn(async () => ({ data: { processing_status: 'ready', moderation_status: 'approved', visibility: 'public', status: 'approved' }, error: null })),
            })),
          })),
        }
      }

      if (table === 'submissions') {
        return {
          insert: submissionsInsert,
        }
      }

      if (table === 'route_lines') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              in: vi.fn(() => ({
                order: vi.fn(() => ({
                  order: vi.fn(() =>
                    makeThenableResult({
                      data: [{ id: 'route-line-1', climb_id: 'climb-1' }],
                      error: null,
                    })
                  ),
                })),
              })),
            })),
          })),
        }
      }

      return {
        select: vi.fn(() => makeThenableResult({ data: null, error: null, count: 0 })),
      }
    })

    const rpcMock = vi.fn(async (fnName: string) => {
      if (fnName === 'create_submission_routes_service') {
        return {
          data: [{ climb_id: 'climb-1', name: 'Valid Route', grade: '6A' }],
          error: null,
        }
      }

      if (fnName === 'compute_crag_boundary') {
        return {
          data: null,
          error: null,
        }
      }

      return { data: null, error: null }
    })

    vi.mocked(createServerClient).mockImplementation(() => ({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: 'user-happy-path' } }, error: null })),
        getSession: vi.fn(async () => ({ data: { session: null }, error: null })),
      },
      from: fromMock,
      rpc: rpcMock,
      storage: {
        from: vi.fn(() => ({
          remove: vi.fn(async () => ({ data: null, error: null })),
          createSignedUrl: vi.fn(async () => ({ data: { signedUrl: 'https://example.com/signed' }, error: null })),
        })),
      },
    }) as ReturnType<typeof createServerClient>)

    const request = makeSubmissionRequest({
      mode: 'existing',
      imageId: 'image-1',
      routeType: 'sport',
      routes: [
        {
          id: 'route-happy-1',
          name: 'Valid Route',
          grade: '6A',
          points: [
            { x: 10, y: 20 },
            { x: 30, y: 45 },
          ],
          sequenceOrder: 0,
          imageWidth: 1200,
          imageHeight: 800,
          imageNaturalWidth: 1200,
          imageNaturalHeight: 800,
        },
      ],
    })

    const response = await POST(request)
    const json = await response.json()

    expect([200, 201]).toContain(response.status)
    expect(json.success).toBe(true)
    expect(json.climbsCreated).toBe(1)
    expect(json.imageId).toBe('image-1')
  })
})
