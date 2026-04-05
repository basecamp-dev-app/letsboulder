import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, test, vi } from 'vitest'

vi.mock('@/lib/csrf', () => ({
  validateCsrfToken: vi.fn(),
}))

vi.mock('@/lib/supabase-server', () => ({
  getServerClientFromRequest: vi.fn(),
}))

import { POST } from '@/app/api/auth/signout/route'
import { validateCsrfToken } from '@/lib/csrf'
import { getServerClientFromRequest } from '@/lib/supabase-server'

describe('POST /api/auth/signout', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  test('returns 403 when CSRF validation fails', async () => {
    vi.mocked(validateCsrfToken).mockResolvedValue(false)

    const response = await POST(new NextRequest('http://localhost:3000/api/auth/signout', { method: 'POST' }))
    const json = await response.json()

    expect(response.status).toBe(403)
    expect(json.error).toContain('CSRF')
    expect(getServerClientFromRequest).not.toHaveBeenCalled()
  })

  test('signs out and returns success when CSRF validation passes', async () => {
    const signOut = vi.fn(async () => ({ error: null }))

    vi.mocked(validateCsrfToken).mockResolvedValue(true)
    vi.mocked(getServerClientFromRequest).mockReturnValue({
      auth: { signOut },
    } as never)

    const request = new NextRequest('http://localhost:3000/api/auth/signout', {
      method: 'POST',
      headers: { 'x-csrf-token': 'test-csrf-token' },
    })

    const response = await POST(request)
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json).toEqual({ success: true })
    expect(signOut).toHaveBeenCalledTimes(1)
    expect(getServerClientFromRequest).toHaveBeenCalledWith(request)
  })
})
