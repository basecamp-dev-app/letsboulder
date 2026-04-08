import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, test, vi } from 'vitest'

const { getServerClientFromRequest } = vi.hoisted(() => ({
  getServerClientFromRequest: vi.fn(),
}))

vi.mock('@/lib/env.server', () => ({
  serverEnv: {
    CSRF_SECRET: 'test-csrf-secret',
  },
}))

vi.mock('@/lib/supabase-server', () => ({
  getServerClientFromRequest,
}))

import { GET } from '@/app/api/csrf/route'

function makeRequest() {
  return new NextRequest('http://localhost:3000/api/csrf')
}

describe('/api/csrf', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  test('returns a csrf token and sets the csrf cookie on the same response', async () => {
    vi.mocked(getServerClientFromRequest).mockReturnValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: 'user-123' } }, error: null })),
      },
    } as never)

    const response = await GET(makeRequest())

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({ token: expect.any(String) })
    expect(response.headers.get('set-cookie')).toContain('csrf_token=')
  })

  test('returns 401 when no user is authenticated', async () => {
    vi.mocked(getServerClientFromRequest).mockReturnValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: null }, error: null })),
      },
    } as never)

    const response = await GET(makeRequest())

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' })
  })
})
