import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, test, vi } from 'vitest'

vi.mock('@/lib/csrf', () => ({
  validateCsrfToken: vi.fn(),
}))

vi.mock('@/lib/proxy-rate-limit', () => ({
  applyProxyRateLimit: vi.fn(),
}))

vi.mock('@/lib/proxy-auth', () => ({
  applyProxyAuth: vi.fn(),
}))

import proxy from '@/proxy'
import { validateCsrfToken } from '@/lib/csrf'
import { applyProxyRateLimit } from '@/lib/proxy-rate-limit'
import { applyProxyAuth } from '@/lib/proxy-auth'

describe('proxy CSRF handling', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    ;(validateCsrfToken as any).mockResolvedValue(false)
    ;(applyProxyRateLimit as any).mockResolvedValue(null)
    ;(applyProxyAuth as any).mockResolvedValue(Response.json({ ok: true }, { status: 200 }))
  })

  test('allows same-origin server action posts without x-csrf-token', async () => {
    const request = new NextRequest('https://letsboulder.com/submit', {
      method: 'POST',
      headers: {
        host: 'letsboulder.com',
        origin: 'https://letsboulder.com',
        'next-action': 'action-id',
      },
    })

    const response = await proxy(request)

    expect(response.status).toBe(200)
    expect(validateCsrfToken).not.toHaveBeenCalled()
    expect(applyProxyAuth).toHaveBeenCalledOnce()
  })

  test('rejects non-server-action posts without csrf token', async () => {
    const request = new NextRequest('https://letsboulder.com/submit', {
      method: 'POST',
      headers: {
        host: 'letsboulder.com',
        origin: 'https://letsboulder.com',
      },
    })

    const response = await proxy(request)
    const json = await response.json()

    expect(response.status).toBe(403)
    expect(json.error).toBe('Invalid or missing CSRF token')
    expect(validateCsrfToken).toHaveBeenCalledOnce()
    expect(applyProxyAuth).not.toHaveBeenCalled()
  })
})
