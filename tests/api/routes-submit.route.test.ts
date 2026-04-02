import { NextRequest } from 'next/server'
import { describe, expect, test, vi } from 'vitest'

vi.mock('@/lib/csrf-server', () => ({
  withCsrfProtection: vi.fn(async () => ({ valid: true, response: null })),
  withApiMiddleware: vi.fn(),
}))

vi.mock('@/lib/auth-context', () => ({
  resolveUserIdWithFallback: vi.fn(async () => ({ userId: 'user-1', authError: null })),
}))

import { POST } from '@/app/api/routes/submit/route'
import { withApiMiddleware } from '@/lib/csrf-server'
import { resolveUserIdWithFallback } from '@/lib/auth-context'

type RouteSubmitMiddlewareResult = Awaited<ReturnType<typeof withApiMiddleware>>

const routeSubmitSupabaseStub = {
  from: vi.fn((table: string) => {
    if (table === 'climbs') {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              gte: vi.fn(() => makeThenableResult({ data: null, error: null, count: 0 })),
            })),
          })),
        })),
        insert: vi.fn(async () => ({ error: null })),
      }
    }

    return {
      select: vi.fn(() => ({ eq: vi.fn(() => ({ eq: vi.fn(() => ({ gte: vi.fn(() => makeThenableResult({ data: null, error: null, count: 0 })) })) })) })),
      insert: vi.fn(async () => ({ error: null })),
    }
  }),
}

function makeSubmitRequest(body: unknown) {
  return new NextRequest('http://localhost:3000/api/routes/submit', {
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

describe('Routes submit route validation', () => {
  test.beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(withApiMiddleware).mockResolvedValue({
      ok: true,
      supabase: routeSubmitSupabaseStub as never,
      userId: 'user-1',
    } as unknown as RouteSubmitMiddlewareResult)
  })

  test('returns 401 when auth user id cannot be resolved', async () => {
    vi.mocked(withApiMiddleware).mockResolvedValueOnce({
      ok: false,
      response: Response.json({ error: 'Authentication required' }, { status: 401 }),
    } as unknown as RouteSubmitMiddlewareResult)
    vi.mocked(resolveUserIdWithFallback).mockResolvedValueOnce({ userId: null, authError: null })

    const response = await POST(makeSubmitRequest({}))
    const json = await response.json()

    expect(response.status).toBe(401)
    expect(json.error).toBe('Authentication required')
  })

  test('returns 400 when required fields are missing', async () => {
    const response = await POST(makeSubmitRequest({ name: 'Only Name' }))
    const json = await response.json()

    expect(response.status).toBe(400)
    expect(json.error).toBe('Invalid request data')
    expect(json.fieldErrors.grade?.[0]).toBeDefined()
  })

  test('returns 400 for invalid grade', async () => {
    const response = await POST(makeSubmitRequest({
      name: 'Bad Grade Route',
      grade: 'V4',
      imageUrl: 'https://example.com/route.jpg',
      latitude: 49.2,
      longitude: -2.1,
      cragsId: 'crag-1',
    }))
    const json = await response.json()

    expect(response.status).toBe(400)
    expect(json.error).toBe('Invalid request data')
    expect(json.fieldErrors.grade?.[0]).toContain('Invalid grade')
  })

  test('returns 429 when daily route limit is reached', async () => {
    vi.mocked(withApiMiddleware).mockResolvedValueOnce({
      ok: true,
      supabase: {
        from: vi.fn((table: string) => {
          if (table === 'climbs') {
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    gte: vi.fn(() => makeThenableResult({ data: null, error: null, count: 5 })),
                  })),
                })),
              })),
              insert: vi.fn(async () => ({ error: null })),
            }
          }

          return routeSubmitSupabaseStub.from(table)
        }),
      } as never,
      userId: 'user-1',
    } as unknown as RouteSubmitMiddlewareResult)

    const response = await POST(makeSubmitRequest({
      name: 'Daily Limit Route',
      grade: '6A',
      imageUrl: 'https://example.com/route.jpg',
      latitude: 49.2,
      longitude: -2.1,
      cragsId: 'crag-1',
    }))
    const json = await response.json()

    expect(response.status).toBe(429)
    expect(json.error).toContain('Daily limit reached')
  })
})
