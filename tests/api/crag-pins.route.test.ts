import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  fetchViewportMapFeaturesWithClient,
  getUnauthenticatedClient,
  rateLimit,
  reportError,
} = vi.hoisted(() => ({
  fetchViewportMapFeaturesWithClient: vi.fn(),
  getUnauthenticatedClient: vi.fn(() => ({ from: vi.fn() })),
  rateLimit: vi.fn(),
  reportError: vi.fn(),
}))

vi.mock('@/lib/supabase-server', () => ({
  fetchViewportMapFeaturesWithClient,
  getUnauthenticatedClient,
}))
vi.mock('@/lib/rate-limit', () => ({
  rateLimit,
  createRateLimitResponse: (result: { resetTime: number }) => Response.json(
    { error: 'Rate limit exceeded. Please try again later.' },
    { status: 429, headers: { 'X-RateLimit-Reset': String(result.resetTime) } }
  ),
}))
vi.mock('@/lib/errors', () => ({ reportError }))

import { GET } from '@/app/api/crags/pins/route'

function request(query = '') {
  return new NextRequest(`http://localhost:3000/api/crags/pins${query}`)
}

describe('GET /api/crags/pins', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    fetchViewportMapFeaturesWithClient.mockResolvedValue([])
    rateLimit.mockResolvedValue({ success: true, remaining: 99, resetTime: Date.now() + 60_000, limit: 100 })
  })

  it('requires a complete viewport before rate limiting or querying', async () => {
    const response = await GET(request())

    expect(response.status).toBe(400)
    expect(rateLimit).not.toHaveBeenCalled()
    expect(getUnauthenticatedClient).not.toHaveBeenCalled()
  })

  it('passes valid normal and antimeridian viewports to the public helper', async () => {
    const response = await GET(request('?north=50&south=40&west=-10&east=0&zoom=12'))
    await GET(request('?north=20&south=-20&west=170&east=-170&zoom=5'))

    expect(fetchViewportMapFeaturesWithClient).toHaveBeenNthCalledWith(1, expect.anything(), {
      north: 50, south: 40, west: -10, east: 0, zoom: 12,
    })
    expect(fetchViewportMapFeaturesWithClient).toHaveBeenNthCalledWith(2, expect.anything(), {
      north: 20, south: -20, west: 170, east: -170, zoom: 5,
    })
    expect(response.headers.get('Cache-Control')).toBe('public, s-maxage=300, stale-while-revalidate=3600')
  })

  it('enforces the public-search rate limit in the route', async () => {
    rateLimit.mockResolvedValue({ success: false, remaining: 0, resetTime: 123, limit: 100 })

    const response = await GET(request('?north=50&south=40&west=-10&east=0&zoom=12'))

    expect(response.status).toBe(429)
    expect(fetchViewportMapFeaturesWithClient).not.toHaveBeenCalled()
  })

  it.each([
    '?north=60&south=40&west=-10&east=20',
    '?north=40&south=60&west=-10&east=20&zoom=5',
    '?north=60&south=40&west=-10&east=20&zoom=5.5',
    '?north=&south=40&west=-10&east=20&zoom=5',
    '?north=60&south=40&west=-10&east=20&zoom=5&extra=true',
    '?north=60&north=50&south=40&west=-10&east=20&zoom=5',
    '?north=85&south=-85&west=-180&east=180&zoom=12',
    '?north=5&south=-5&west=-5&east=5&zoom=13',
  ])('rejects malformed viewport query %s', async (query) => {
    const response = await GET(request(query))

    expect(response.status).toBe(400)
    expect(fetchViewportMapFeaturesWithClient).not.toHaveBeenCalled()
  })

  it('returns an error rather than converting an RPC failure to empty pins', async () => {
    fetchViewportMapFeaturesWithClient.mockRejectedValueOnce(new Error('database unavailable'))

    const response = await GET(request('?north=60&south=40&west=-10&east=20&zoom=5'))

    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ error: 'Internal server error' })
    expect(reportError).toHaveBeenCalled()
  })
})
