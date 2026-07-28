import { NextRequest } from 'next/server'
import { afterAll, beforeEach, describe, expect, test, vi } from 'vitest'

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

const ORIGINAL_ENV = process.env

describe('proxy CSRF handling', () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV }
    vi.resetAllMocks()
    ;(validateCsrfToken as unknown as { mockResolvedValue: (value: unknown) => unknown }).mockResolvedValue(false)
    ;(applyProxyRateLimit as unknown as { mockResolvedValue: (value: unknown) => unknown }).mockResolvedValue(null)
    ;(applyProxyAuth as unknown as { mockResolvedValue: (value: unknown) => unknown }).mockResolvedValue(Response.json({ ok: true }, { status: 200 }))
  })

  afterAll(() => {
    process.env = ORIGINAL_ENV
  })

  test('blocks test API routes unless explicitly enabled', async () => {
    const response = await proxy(new NextRequest('https://letsboulder.com/api/test/segment/auth', {
      method: 'POST',
    }))

    expect(response.status).toBe(404)
    expect(validateCsrfToken).not.toHaveBeenCalled()
    expect(applyProxyAuth).not.toHaveBeenCalled()
  })

  test('blocks test API routes in production even when enabled', async () => {
    process.env.ENABLE_TEST_AUTH_ENDPOINT = 'true'
    process.env.VERCEL_ENV = 'production'

    const response = await proxy(new NextRequest('https://letsboulder.com/api/test/segment/auth', {
      method: 'POST',
    }))

    expect(response.status).toBe(404)
    expect(validateCsrfToken).not.toHaveBeenCalled()
    expect(applyProxyAuth).not.toHaveBeenCalled()
  })

  test('allows explicitly enabled test API routes outside production', async () => {
    process.env.ENABLE_TEST_AUTH_ENDPOINT = 'true'
    process.env.VERCEL_ENV = 'preview'

    const response = await proxy(new NextRequest('https://preview.letsboulder.com/api/test/segment/auth', {
      method: 'POST',
    }))

    expect(response.status).toBe(200)
    expect(validateCsrfToken).not.toHaveBeenCalled()
    expect(applyProxyRateLimit).not.toHaveBeenCalled()
    expect(applyProxyAuth).not.toHaveBeenCalled()
  })

  test('rate limits public viewport map reads', async () => {
    const request = new NextRequest('https://letsboulder.com/api/crags/pins?north=1&south=0&east=1&west=0&zoom=12')

    const response = await proxy(request)

    expect(response.status).toBe(200)
    expect(applyProxyRateLimit).toHaveBeenCalledWith(request)
    expect(applyProxyAuth).toHaveBeenCalledOnce()
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
