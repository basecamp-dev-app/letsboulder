import { afterEach, describe, expect, it } from 'vitest'
import { NextRequest } from 'next/server'

import { applyProxyRateLimit } from '@/lib/proxy-rate-limit'

const originalEnv = process.env

function request(path: string, method = 'POST', ip = '203.0.113.10') {
  return new NextRequest(`https://letsboulder.com${path}`, {
    method,
    headers: { 'x-forwarded-for': ip },
  })
}

describe('proxy rate-limit scoping', () => {
  afterEach(() => {
    process.env = originalEnv
  })

  it('does not double-count normal draft editing or autosave traffic', async () => {
    process.env = {
      ...originalEnv,
      VERCEL_ENV: 'production',
      UPSTASH_REDIS_REST_URL: '',
      UPSTASH_REDIS_REST_TOKEN: '',
    }

    for (let index = 0; index < 80; index += 1) {
      await expect(
        applyProxyRateLimit(request('/api/submissions/drafts/draft-123', 'PATCH')),
      ).resolves.toBeNull()
      await expect(
        applyProxyRateLimit(request('/api/submissions/drafts/draft-123/routes', 'POST')),
      ).resolves.toBeNull()
    }
  })

  it('does not consume write allowance for media status polling', async () => {
    process.env = { ...originalEnv, VERCEL_ENV: 'production' }

    for (let index = 0; index < 100; index += 1) {
      await expect(
        applyProxyRateLimit(request('/api/media/upload-sessions/image-123', 'GET')),
      ).resolves.toBeNull()
    }
  })

  it('still blocks true generic write exhaustion and returns retry metadata', async () => {
    process.env = {
      ...originalEnv,
      VERCEL_ENV: 'production',
      UPSTASH_REDIS_REST_URL: '',
      UPSTASH_REDIS_REST_TOKEN: '',
    }

    const ip = '203.0.113.51'
    for (let index = 0; index < 50; index += 1) {
      await expect(applyProxyRateLimit(request('/api/preferences', 'POST', ip))).resolves.toBeNull()
    }

    const blocked = await applyProxyRateLimit(request('/api/preferences', 'POST', ip))
    expect(blocked?.status).toBe(429)
    expect(blocked?.headers.get('retry-after')).toMatch(/^\d+$/)
    await expect(blocked?.json()).resolves.toEqual(expect.objectContaining({
      error: expect.stringContaining('Rate limit exceeded'),
      retry_after: expect.any(Number),
    }))
  })

  it('keeps generic write buckets isolated by IP', async () => {
    process.env = {
      ...originalEnv,
      VERCEL_ENV: 'production',
      UPSTASH_REDIS_REST_URL: '',
      UPSTASH_REDIS_REST_TOKEN: '',
    }

    const firstIp = '203.0.113.61'
    for (let index = 0; index < 51; index += 1) {
      await applyProxyRateLimit(request('/api/preferences', 'POST', firstIp))
    }

    await expect(
      applyProxyRateLimit(request('/api/preferences', 'POST', '203.0.113.62')),
    ).resolves.toBeNull()
  })
})
