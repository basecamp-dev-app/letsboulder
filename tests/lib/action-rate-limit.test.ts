import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockHeaders, mockRateLimit } = vi.hoisted(() => ({
  mockHeaders: vi.fn(),
  mockRateLimit: vi.fn(),
}))

vi.mock('next/headers', () => ({
  headers: mockHeaders,
}))

vi.mock('@/lib/rate-limit', () => ({
  rateLimit: mockRateLimit,
}))

import { applyActionRateLimit } from '@/lib/actions/action-rate-limit'

describe('Server Action rate limiting', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockHeaders.mockResolvedValue(new Headers({ 'x-forwarded-for': '203.0.113.70' }))
  })

  it('uses the authenticated user identity and allows normal action traffic', async () => {
    mockRateLimit.mockResolvedValue({
      success: true,
      remaining: 19,
      resetTime: Date.now() + 60_000,
      limit: 20,
    })

    await expect(
      applyActionRateLimit('draftPublish', 'user-a', 'Publish limit reached.'),
    ).resolves.toBeNull()

    expect(mockRateLimit).toHaveBeenCalledWith(
      expect.any(Request),
      'draftPublish',
      'user-a',
    )
  })

  it('returns a Next-compatible ActionResult with retry and reset information', async () => {
    const resetTime = Date.now() + 90_000
    mockRateLimit.mockResolvedValue({
      success: false,
      remaining: 0,
      resetTime,
      limit: 20,
    })

    const result = await applyActionRateLimit(
      'draftPublish',
      'user-a',
      'You have reached the current draft publish limit.',
    )

    expect(result).toEqual(expect.objectContaining({
      success: false,
      status: 429,
      error: expect.stringContaining('Try again in'),
      retryAfter: expect.any(Number),
      resetAt: resetTime,
    }))
    expect(result?.retryAfter).toBeGreaterThan(0)
  })

  it('keeps contributor identities separate from one another', async () => {
    mockRateLimit.mockResolvedValue({
      success: true,
      remaining: 10,
      resetTime: Date.now() + 60_000,
      limit: 20,
    })

    await applyActionRateLimit('draftCreate', 'user-a', 'Draft limit reached.')
    await applyActionRateLimit('draftCreate', 'user-b', 'Draft limit reached.')

    expect(mockRateLimit).toHaveBeenNthCalledWith(1, expect.any(Request), 'draftCreate', 'user-a')
    expect(mockRateLimit).toHaveBeenNthCalledWith(2, expect.any(Request), 'draftCreate', 'user-b')
  })
})
