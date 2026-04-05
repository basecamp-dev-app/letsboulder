import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

vi.mock('@/lib/env.server', () => ({
  serverEnv: {
    UPSTASH_REDIS_REST_URL: '',
    UPSTASH_REDIS_REST_TOKEN: '',
  },
}))

vi.mock('@/lib/errors', () => ({
  reportError: vi.fn(),
}))

describe('checkRateLimit fallback policy', () => {
  beforeEach(() => {
    vi.resetModules()
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
})
