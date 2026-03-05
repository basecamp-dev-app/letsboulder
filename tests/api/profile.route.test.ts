import { NextRequest } from 'next/server'
import { describe, expect, test, vi } from 'vitest'
import { createServerClient } from '@supabase/ssr'

vi.mock('@/lib/csrf-server', () => ({
  withCsrfProtection: vi.fn(async () => ({ valid: true, response: null })),
}))

vi.mock('@/lib/rate-limit', () => ({
  rateLimit: vi.fn(() => ({ success: true })),
  createRateLimitResponse: vi.fn(() => null),
}))

vi.mock('@/lib/auth-context', () => ({
  resolveUserIdWithFallback: vi.fn(async () => ({ userId: 'user-1', authError: null })),
}))

import { GET, PUT } from '@/app/api/profile/route'
import { resolveUserIdWithFallback } from '@/lib/auth-context'

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
  test('PUT returns 400 for invalid username format', async () => {
    const request = makePutRequest({ username: 'bad name with spaces' })
    const response = await PUT(request)
    const json = await response.json()

    expect(response.status).toBe(400)
    expect(json.error).toContain('Username can only contain')
  })

  test('PUT returns 400 for invalid gender value', async () => {
    const request = makePutRequest({ gender: 'invalid-gender' })
    const response = await PUT(request)
    const json = await response.json()

    expect(response.status).toBe(400)
    expect(json.error).toBe('Invalid gender value')
  })

  test('GET returns 401 when user is not resolved', async () => {
    vi.mocked(resolveUserIdWithFallback).mockResolvedValueOnce({ userId: null, authError: null })

    const response = await GET(new NextRequest('http://localhost:3000/api/profile'))
    const json = await response.json()

    expect(response.status).toBe(401)
    expect(json.error).toBe('Unauthorized')
  })

  test('PUT returns 409 when username is already taken', async () => {
    vi.mocked(createServerClient).mockImplementationOnce(() => ({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { email: 'user@example.com' } }, error: null })),
      },
      from: vi.fn((table: string) => {
        if (table === 'profiles') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn(async () => ({ data: { email: 'user@example.com' }, error: null })),
              })),
            })),
            update: vi.fn(() => ({
              eq: vi.fn(() => ({
                select: vi.fn(() => ({
                  single: vi.fn(async () => ({
                    data: null,
                    error: { code: '23505', message: 'duplicate key value violates unique constraint' },
                  })),
                })),
              })),
            })),
          }
        }

        return {
          select: vi.fn(() => ({ eq: vi.fn(() => ({ single: vi.fn(async () => ({ data: null, error: null })) })) })),
        }
      }),
    }) as ReturnType<typeof createServerClient>)

    const request = makePutRequest({ username: 'duplicate-user', first_name: 'Test', last_name: 'User' })
    const response = await PUT(request)
    const json = await response.json()

    expect(response.status).toBe(409)
    expect(json.error).toBe('Username is already taken')
    expect(Array.isArray(json.suggestions)).toBe(true)
  })
})
