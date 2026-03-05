import { NextRequest } from 'next/server'
import { describe, expect, test, vi } from 'vitest'
import { createServerClient } from '@supabase/ssr'

vi.mock('@/lib/csrf-server', () => ({
  withCsrfProtection: vi.fn(async () => ({ valid: true, response: null })),
}))

vi.mock('@/lib/auth-context', () => ({
  resolveUserIdWithFallback: vi.fn(async () => ({ userId: 'user-1', authError: null })),
}))

import { POST } from '@/app/api/routes/submit/route'
import { resolveUserIdWithFallback } from '@/lib/auth-context'

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
  test('returns 401 when auth user id cannot be resolved', async () => {
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
    expect(json.error).toBe('Missing required fields')
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
    expect(json.error).toBe('Invalid grade')
  })

  test('returns 429 when daily route limit is reached', async () => {
    vi.mocked(createServerClient).mockImplementationOnce(() => ({
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
          }
        }

        return {
          select: vi.fn(() => ({ eq: vi.fn(() => ({ eq: vi.fn(() => ({ gte: vi.fn(() => makeThenableResult({ data: null, error: null, count: 0 })) })) })) })),
          insert: vi.fn(async () => ({ error: null })),
        }
      }),
    }) as ReturnType<typeof createServerClient>)

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
