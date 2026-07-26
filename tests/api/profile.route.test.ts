import { NextRequest } from 'next/server'
import { describe, expect, test, vi } from 'vitest'

vi.mock('@/lib/csrf-server', () => ({
  withCsrfProtection: vi.fn(async () => ({ valid: true, response: null })),
  withApiMiddleware: vi.fn(),
}))

vi.mock('@/lib/rate-limit', () => ({
  rateLimit: vi.fn(() => ({ success: true })),
  createRateLimitResponse: vi.fn(() => null),
}))

vi.mock('@/lib/auth-context', () => ({
  resolveUserIdWithFallback: vi.fn(async () => ({ userId: 'user-1', authError: null })),
}))

import { GET, PUT } from '@/app/api/profile/route'
import { withApiMiddleware } from '@/lib/csrf-server'
import { resolveUserIdWithFallback } from '@/lib/auth-context'

type ProfileMiddlewareResult = Awaited<ReturnType<typeof withApiMiddleware>>

const profileSupabaseStub = {
  auth: {
    getUser: vi.fn(async () => ({ data: { user: { email: 'user@example.com' } }, error: null })),
  },
  rpc: vi.fn(async () => ({ data: { id: 'user-1', email: 'user@example.com' }, error: null })),
  from: vi.fn((table: string) => {
    if (table === 'profiles') {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn(async () => ({ data: { email: 'user@example.com' }, error: null })),
          })),
        })),
        update: vi.fn(() => ({
          eq: vi.fn(async () => ({ data: null, error: null })),
        })),
      }
    }

    return {
      select: vi.fn(() => ({ eq: vi.fn(() => ({ single: vi.fn(async () => ({ data: null, error: null })) })) })),
    }
  }),
}

function makePutRequest(body: unknown) {
  return new NextRequest('http://localhost:3000/api/profile', {
    method: 'PUT',
    headers: {
      'content-type': 'application/json',
      'x-csrf-token': 'test-csrf-token',
    },
    body: JSON.stringify(body),
  })
}

describe('Profile route validation', () => {
  test.beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(withApiMiddleware).mockResolvedValue({
      ok: true,
      supabase: profileSupabaseStub as never,
      userId: 'user-1',
    } as unknown as ProfileMiddlewareResult)
  })

  test('PUT returns 400 for invalid username format', async () => {
    const request = makePutRequest({ username: 'bad name with spaces' })
    const response = await PUT(request)
    const json = await response.json()

    expect(response.status).toBe(400)
    expect(json.error).toBe('Invalid request data')
    expect(json.fieldErrors.username?.[0]).toContain('Username can only contain')
  })

  test('PUT returns 400 for invalid gender value', async () => {
    const request = makePutRequest({ gender: 'invalid-gender' })
    const response = await PUT(request)
    const json = await response.json()

    expect(response.status).toBe(400)
    expect(json.error).toBe('Invalid request data')
    expect(json.fieldErrors.gender?.[0]).toBeDefined()
  })

  test('GET returns 401 when user is not resolved', async () => {
    vi.mocked(resolveUserIdWithFallback).mockResolvedValueOnce({ userId: null, authError: null })

    const response = await GET(new NextRequest('http://localhost:3000/api/profile'))
    const json = await response.json()

    expect(response.status).toBe(401)
    expect(json.error).toBe('Unauthorized')
  })

  test('PUT returns 409 when username is already taken', async () => {
    vi.mocked(withApiMiddleware).mockResolvedValueOnce({
      ok: true,
      supabase: {
        auth: {
          getUser: vi.fn(async () => ({ data: { user: { email: 'user@example.com' } }, error: null })),
        },
        rpc: vi.fn(async () => ({ data: { id: 'user-1' }, error: null })),
        from: vi.fn((table: string) => {
          if (table === 'profiles') {
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  single: vi.fn(async () => ({ data: { email: 'user@example.com' }, error: null })),
                })),
              })),
              update: vi.fn(() => ({
                eq: vi.fn(async () => ({
                  data: null,
                  error: { code: '23505', message: 'duplicate key value violates unique constraint' },
                })),
              })),
            }
          }

          return {
            select: vi.fn(() => ({ eq: vi.fn(() => ({ single: vi.fn(async () => ({ data: null, error: null })) })) })),
          }
        }),
      } as never,
      userId: 'user-1',
    } as unknown as ProfileMiddlewareResult)

    const request = makePutRequest({ username: 'duplicate-user', first_name: 'Test', last_name: 'User' })
    const response = await PUT(request)
    const json = await response.json()

    expect(response.status).toBe(409)
    expect(json.error).toBe('Username is already taken')
    expect(Array.isArray(json.suggestions)).toBe(true)
  })
})
