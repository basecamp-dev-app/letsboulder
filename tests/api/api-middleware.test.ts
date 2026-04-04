import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, test, vi } from 'vitest'

vi.mock('@/lib/auth-context', () => ({
  resolveUserIdWithFallback: vi.fn(),
}))

vi.mock('@/lib/rate-limit', () => ({
  RATE_LIMITS: {
    authenticatedWrite: { windowMs: 60_000, maxRequests: 10 },
  },
  rateLimit: vi.fn(),
  createRateLimitResponse: vi.fn(() => new Response('too many', { status: 429 })),
}))

vi.mock('@/lib/supabase-server', () => ({
  getServerClientFromRequest: vi.fn(() => ({ auth: { getUser: vi.fn() } })),
}))

import { resolveUserIdWithFallback } from '@/lib/auth-context'
import { withApiMiddleware } from '@/lib/csrf-server'
import { createRateLimitResponse, rateLimit } from '@/lib/rate-limit'

function makeRequest() {
  return new NextRequest('http://localhost:3000/api/test', {
    method: 'POST',
    headers: {
      'x-csrf-token': 'test-csrf-token',
    },
  })
}

describe('withApiMiddleware', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(resolveUserIdWithFallback).mockResolvedValue({ userId: null, authError: null })
    vi.mocked(rateLimit).mockResolvedValue({ success: true, remaining: 9, resetTime: Date.now() + 1_000, limit: 10 })
  })

  test('rate limits anonymous requests when requireUser is false', async () => {
    const result = await withApiMiddleware(makeRequest(), {
      requireCsrf: false,
      requireUser: false,
      rateLimitKey: 'authenticatedWrite',
    })

    expect(result.ok).toBe(true)
    expect(resolveUserIdWithFallback).toHaveBeenCalledOnce()
    expect(rateLimit).toHaveBeenCalledWith(expect.any(NextRequest), 'authenticatedWrite', undefined)
  })

  test('rate limits authenticated optional-user requests by user id', async () => {
    vi.mocked(resolveUserIdWithFallback).mockResolvedValueOnce({ userId: 'user-123', authError: null })

    const result = await withApiMiddleware(makeRequest(), {
      requireCsrf: false,
      requireUser: false,
      rateLimitKey: 'authenticatedWrite',
    })

    expect(result.ok).toBe(true)
    expect(rateLimit).toHaveBeenCalledWith(expect.any(NextRequest), 'authenticatedWrite', 'user-123')
  })

  test('returns 401 before rate limiting when requireUser is true and auth is missing', async () => {
    const result = await withApiMiddleware(makeRequest(), {
      requireCsrf: false,
      requireUser: true,
      rateLimitKey: 'authenticatedWrite',
      unauthorizedMessage: 'Authentication required',
    })

    expect(result.ok).toBe(false)
    if (result.ok) {
      throw new Error('Expected middleware failure')
    }

    expect(result.response.status).toBe(401)
    expect(rateLimit).not.toHaveBeenCalled()
  })

  test('returns rate limit response for optional-user routes', async () => {
    const limitedResponse = new Response('too many', { status: 429 })
    vi.mocked(rateLimit).mockResolvedValueOnce({ success: false, remaining: 0, resetTime: Date.now() + 1_000, limit: 10 })
    vi.mocked(createRateLimitResponse).mockReturnValueOnce(limitedResponse)

    const result = await withApiMiddleware(makeRequest(), {
      requireCsrf: false,
      requireUser: false,
      rateLimitKey: 'authenticatedWrite',
    })

    expect(result.ok).toBe(false)
    if (result.ok) {
      throw new Error('Expected middleware failure')
    }

    expect(createRateLimitResponse).toHaveBeenCalledOnce()
    expect(result.response).toBe(limitedResponse)
  })
})
