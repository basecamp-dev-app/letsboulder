import { NextRequest } from 'next/server'
import { describe, expect, test, vi } from 'vitest'
import { createServerClient } from '@supabase/ssr'

vi.mock('@/lib/csrf-server', () => ({
  withCsrfProtection: vi.fn(async () => ({ valid: true, response: null })),
}))

import { POST } from '@/app/api/community/posts/route'

function makePostRequest(body: unknown) {
  return new NextRequest('http://localhost:3000/api/community/posts', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-csrf-token': 'test-csrf-token',
    },
    body: JSON.stringify(body),
  })
}

function mockAuthedClient(overrides?: {
  placeFound?: boolean
}) {
  vi.mocked(createServerClient).mockImplementationOnce(() => ({
    auth: {
      getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } }, error: null })),
    },
    from: vi.fn((table: string) => {
      if (table === 'places') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: overrides?.placeFound === false ? null : { id: 'place-1' },
                error: null,
              })),
            })),
          })),
        }
      }

      if (table === 'community_posts') {
        return {
          insert: vi.fn(() => ({
            select: vi.fn(() => ({
              single: vi.fn(async () => ({
                data: { id: 'post-1', place_id: 'place-1', type: 'update' },
                error: null,
              })),
            })),
          })),
        }
      }

      return {
        select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: vi.fn(async () => ({ data: null, error: null })) })) })),
      }
    }),
  }) as ReturnType<typeof createServerClient>)
}

describe('Community posts route validation', () => {
  test('returns 400 for invalid post type', async () => {
    mockAuthedClient()

    const response = await POST(makePostRequest({ type: 'invalid', place_id: 'place-1', body: 'Hello' }))
    const json = await response.json()

    expect(response.status).toBe(400)
    expect(json.error).toBe('Invalid post type')
  })

  test('returns 400 when session post missing start_at', async () => {
    mockAuthedClient()

    const response = await POST(makePostRequest({ type: 'session', place_id: 'place-1', body: 'Hello' }))
    const json = await response.json()

    expect(response.status).toBe(400)
    expect(json.error).toContain('start_at')
  })

  test('returns 400 when end_at is before start_at', async () => {
    mockAuthedClient()

    const response = await POST(makePostRequest({
      type: 'session',
      place_id: 'place-1',
      body: 'Hello',
      start_at: '2026-01-01T10:00:00.000Z',
      end_at: '2026-01-01T09:00:00.000Z',
    }))
    const json = await response.json()

    expect(response.status).toBe(400)
    expect(json.error).toBe('end_at must be after start_at')
  })

  test('returns 404 when place does not exist', async () => {
    mockAuthedClient({ placeFound: false })

    const response = await POST(makePostRequest({
      type: 'update',
      place_id: 'missing-place',
      body: 'Hello',
    }))
    const json = await response.json()

    expect(response.status).toBe(404)
    expect(json.error).toBe('Place not found')
  })
})
