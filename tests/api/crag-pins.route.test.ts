import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { fetchViewportMapFeaturesWithClient, getViewportMapClient, reportError } = vi.hoisted(() => ({
  fetchViewportMapFeaturesWithClient: vi.fn(),
  getViewportMapClient: vi.fn(() => ({ client: true })),
  reportError: vi.fn(),
}))

vi.mock('@/lib/supabase-server', () => ({
  fetchViewportMapFeaturesWithClient,
  getViewportMapClient,
}))

vi.mock('@/lib/errors', () => ({ reportError }))
vi.mock('@/lib/env.server', () => ({
  serverEnv: { NEXT_PUBLIC_ALLOW_PENDING_IMAGES: true },
}))

import { GET } from '@/app/api/crags/pins/route'

function request(query = '') {
  return new NextRequest(`http://localhost:3000/api/crags/pins${query}`)
}

describe('GET /api/crags/pins', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    fetchViewportMapFeaturesWithClient.mockResolvedValue([])
  })

  it('requires a complete viewport', async () => {
    const response = await GET(request())

    expect(response.status).toBe(400)
    expect(getViewportMapClient).not.toHaveBeenCalled()
  })

  it('passes valid normal and antimeridian viewports to the viewport helper', async () => {
    const response = await GET(request('?north=50&south=40&west=-10&east=0&zoom=12'))
    await GET(request('?north=20&south=-20&west=170&east=-170&zoom=5'))

    expect(fetchViewportMapFeaturesWithClient).toHaveBeenNthCalledWith(1, { client: true }, {
      north: 50, south: 40, west: -10, east: 0, zoom: 12,
    }, true)
    expect(fetchViewportMapFeaturesWithClient).toHaveBeenNthCalledWith(2, { client: true }, {
      north: 20, south: -20, west: 170, east: -170, zoom: 5,
    }, true)
    expect(getViewportMapClient).toHaveBeenCalledTimes(2)
    expect(response.headers.get('Cache-Control')).toBe('public, s-maxage=60, stale-while-revalidate=300')
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
    expect(getViewportMapClient).not.toHaveBeenCalled()
  })

  it('returns an error rather than converting an RPC failure to empty pins', async () => {
    fetchViewportMapFeaturesWithClient.mockRejectedValueOnce(new Error('database unavailable'))

    const response = await GET(request('?north=60&south=40&west=-10&east=20&zoom=5'))

    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ error: 'Internal server error' })
    expect(reportError).toHaveBeenCalled()
  })
})
