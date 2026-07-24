import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  limit: vi.fn(),
  reportError: vi.fn(),
  serverEnv: {
    UPSTASH_REDIS_REST_URL: '',
    UPSTASH_REDIS_REST_TOKEN: '',
  },
}))

vi.mock('@/lib/env.server', () => ({
  serverEnv: mocks.serverEnv,
}))

vi.mock('@/lib/errors', () => ({
  reportError: mocks.reportError,
}))

vi.mock('@upstash/redis', () => ({
  Redis: class MockRedis {},
}))

vi.mock('@upstash/ratelimit', () => ({
  Ratelimit: class MockRatelimit {
    static slidingWindow() {
      return {}
    }

    limit = mocks.limit
  },
}))

describe('checkRateLimit fallback policy', () => {
  beforeEach(() => {
    vi.resetModules()
    mocks.serverEnv.UPSTASH_REDIS_REST_URL = ''
    mocks.serverEnv.UPSTASH_REDIS_REST_TOKEN = ''
    mocks.limit.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  test('uses local fallback buckets for public search when Upstash is unavailable', async () => {
    const { checkRateLimit } = await import('@/lib/upstash-redis')

    const first = await checkRateLimit('anon-ip', 'publicSearch')
    const second = await checkRateLimit('anon-ip', 'publicSearch')

    expect(first.success).toBe(true)
    expect(first.limit).toBe(100)
    expect(first.remaining).toBe(99)
    expect(second.success).toBe(true)
    expect(second.remaining).toBe(98)
  })

  test('enforces upload session create limits via local fallback buckets', async () => {
    const { checkRateLimit } = await import('@/lib/upstash-redis')

    let result = await checkRateLimit('user-123', 'uploadSessionCreate')
    for (let index = 0; index < 12; index++) {
      result = await checkRateLimit('user-123', 'uploadSessionCreate')
    }

    expect(result.success).toBe(false)
    expect(result.limit).toBe(12)
    expect(result.remaining).toBe(0)
  })

  test('keeps rankings fail-open when Upstash is unavailable', async () => {
    const { checkRateLimit } = await import('@/lib/upstash-redis')

    const result = await checkRateLimit('anon-ip', 'rankings')

    expect(result.success).toBe(true)
    expect(result.limit).toBe(9999)
    expect(result.remaining).toBe(9999)
  })

  test('returns fail-open allowance for unknown config keys', async () => {
    const { checkRateLimit } = await import('@/lib/upstash-redis')

    const result = await checkRateLimit('anon-ip', 'missing-tier')

    expect(result.success).toBe(true)
    expect(result.limit).toBe(9999)
    expect(result.remaining).toBe(9999)
  })

  test('uses the local bucket and warns once when a configured limiter rejects', async () => {
    const runtimeError = new Error('getaddrinfo ENOTFOUND cheerful-drake-12236.upstash.io')
    mocks.serverEnv.UPSTASH_REDIS_REST_URL = 'https://cheerful-drake-12236.upstash.io'
    mocks.serverEnv.UPSTASH_REDIS_REST_TOKEN = 'test-token'
    mocks.limit.mockRejectedValue(runtimeError)
    const { checkRateLimit } = await import('@/lib/upstash-redis')

    const first = await checkRateLimit('user-123', 'uploadSessionCreate')
    const second = await checkRateLimit('user-123', 'uploadSessionCreate')

    expect(first).toMatchObject({ success: true, limit: 12, remaining: 11 })
    expect(second).toMatchObject({ success: true, limit: 12, remaining: 10 })
    expect(mocks.reportError).toHaveBeenCalledTimes(1)
    expect(mocks.reportError).toHaveBeenCalledWith(runtimeError, {
      message: 'Rate limiting fallback activated',
      level: 'warning',
    })
  })

  test('uses fail-open when a configured limiter rejects', async () => {
    mocks.serverEnv.UPSTASH_REDIS_REST_URL = 'https://cheerful-drake-12236.upstash.io'
    mocks.serverEnv.UPSTASH_REDIS_REST_TOKEN = 'test-token'
    mocks.limit.mockRejectedValue(new Error('network unavailable'))
    const { checkRateLimit } = await import('@/lib/upstash-redis')

    const result = await checkRateLimit('anon-ip', 'rankings')

    expect(result.success).toBe(true)
    expect(result.limit).toBe(9999)
    expect(result.remaining).toBe(9999)
  })
})
