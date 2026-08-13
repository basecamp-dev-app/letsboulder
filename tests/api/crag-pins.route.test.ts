import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  fetchAdminViewportMapFeaturesWithClient,
  fetchViewportMapFeaturesWithClient,
  getServerClientFromRequest,
  isCurrentUserAdmin,
  reportError,
} = vi.hoisted(() => ({
  fetchAdminViewportMapFeaturesWithClient: vi.fn(),
  fetchViewportMapFeaturesWithClient: vi.fn(),
  getServerClientFromRequest: vi.fn(() => ({ auth: { getUser: vi.fn() } })),
  isCurrentUserAdmin: vi.fn(),
  reportError: vi.fn(),
}))

vi.mock('@/lib/supabase-server', () => ({
  fetchAdminViewportMapFeaturesWithClient,
  fetchViewportMapFeaturesWithClient,
  getServerClientFromRequest,
}))

vi.mock('@/lib/errors', () => ({ reportError }))
vi.mock('@/lib/profile-rpc', () => ({ isCurrentUserAdmin }))
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
    fetchAdminViewportMapFeaturesWithClient.mockResolvedValue([])
    fetchViewportMapFeaturesWithClient.mockResolvedValue([])
    getServerClientFromRequest.mockReturnValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'admin-id' } }, error: null }) },
    })
    isCurrentUserAdmin.mockResolvedValue({ data: true, error: null })
  })

  it('requires a complete viewport', async () => {
    const response = await GET(request())

    expect(response.status).toBe(400)
    expect(getServerClientFromRequest).not.toHaveBeenCalled()
  })

  it('passes valid normal and antimeridian viewports to the viewport helper', async () => {
    const response = await GET(request('?north=50&south=40&west=-10&east=0&zoom=12'))
    await GET(request('?north=20&south=-20&west=170&east=-170&zoom=5'))

    expect(fetchAdminViewportMapFeaturesWithClient).toHaveBeenNthCalledWith(1, expect.anything(), {
      north: 50, south: 40, west: -10, east: 0, zoom: 12,
    })
    expect(fetchAdminViewportMapFeaturesWithClient).toHaveBeenNthCalledWith(2, expect.anything(), {
      north: 20, south: -20, west: 170, east: -170, zoom: 5,
    })
    expect(fetchViewportMapFeaturesWithClient).not.toHaveBeenCalled()
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
  })

  it('does not include pending images for unauthenticated callers', async () => {
    getServerClientFromRequest.mockReturnValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }) },
    })

    await GET(request('?north=50&south=40&west=-10&east=0&zoom=12'))

    expect(fetchViewportMapFeaturesWithClient).toHaveBeenCalledWith(expect.anything(), expect.anything())
    expect(fetchAdminViewportMapFeaturesWithClient).not.toHaveBeenCalled()
    expect(isCurrentUserAdmin).not.toHaveBeenCalled()
  })

  it('does not include pending images for authenticated non-admin callers', async () => {
    isCurrentUserAdmin.mockResolvedValue({ data: false, error: null })

    await GET(request('?north=50&south=40&west=-10&east=0&zoom=12'))

    expect(fetchViewportMapFeaturesWithClient).toHaveBeenCalledWith(expect.anything(), expect.anything())
    expect(fetchAdminViewportMapFeaturesWithClient).not.toHaveBeenCalled()
  })

  it.each([
    { auth: { data: { user: null }, error: new Error('auth failed') }, admin: undefined },
    { auth: { data: { user: { id: 'admin-id' } }, error: null }, admin: { data: null, error: new Error('admin failed') } },
  ])('fails closed to the public RPC when identity checks fail', async ({ auth, admin }) => {
    getServerClientFromRequest.mockReturnValue({
      auth: { getUser: vi.fn().mockResolvedValue(auth) },
    })
    if (admin) isCurrentUserAdmin.mockResolvedValue(admin)

    const response = await GET(request('?north=50&south=40&west=-10&east=0&zoom=12'))

    expect(fetchViewportMapFeaturesWithClient).toHaveBeenCalledOnce()
    expect(fetchAdminViewportMapFeaturesWithClient).not.toHaveBeenCalled()
    expect(response.headers.get('Cache-Control')).toBe('public, s-maxage=60, stale-while-revalidate=300')
  })

  it('uses shared caching for public-only responses', async () => {
    getServerClientFromRequest.mockReturnValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }) },
    })

    const response = await GET(request('?north=50&south=40&west=-10&east=0&zoom=12'))

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
    expect(getServerClientFromRequest).not.toHaveBeenCalled()
  })

  it('returns an error rather than converting an RPC failure to empty pins', async () => {
    fetchAdminViewportMapFeaturesWithClient.mockRejectedValueOnce(new Error('database unavailable'))

    const response = await GET(request('?north=60&south=40&west=-10&east=20&zoom=5'))

    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ error: 'Internal server error' })
    expect(reportError).toHaveBeenCalled()
  })
})
