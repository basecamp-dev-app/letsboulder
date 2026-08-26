import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { fetchAdminViewportMapFeaturesWithClient, requireAdmin, reportError } = vi.hoisted(() => ({
  fetchAdminViewportMapFeaturesWithClient: vi.fn(),
  requireAdmin: vi.fn(),
  reportError: vi.fn(),
}))

vi.mock('@/features/admin/server', () => ({ requireAdmin }))
vi.mock('@/lib/supabase-server', () => ({ fetchAdminViewportMapFeaturesWithClient }))
vi.mock('@/lib/errors', () => ({ reportError }))

import { GET } from '@/app/api/admin/crags/pins/route'

function request(query = '') {
  return new NextRequest(`http://localhost:3000/api/admin/crags/pins${query}`)
}

describe('GET /api/admin/crags/pins', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requireAdmin.mockResolvedValue({ error: null, context: { supabase: {}, userId: 'admin-id' } })
    fetchAdminViewportMapFeaturesWithClient.mockResolvedValue([])
  })

  it('requires an administrator and returns private pin data', async () => {
    const response = await GET(request('?north=50&south=40&west=-10&east=0&zoom=12'))

    expect(requireAdmin).toHaveBeenCalledOnce()
    expect(fetchAdminViewportMapFeaturesWithClient).toHaveBeenCalledWith(expect.anything(), {
      north: 50, south: 40, west: -10, east: 0, zoom: 12,
    })
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
  })

  it('returns the admin authorization error without querying pins', async () => {
    requireAdmin.mockResolvedValue({ error: Response.json({ error: 'Admin access required' }, { status: 403 }), context: null })

    const response = await GET(request('?north=50&south=40&west=-10&east=0&zoom=12'))

    expect(response.status).toBe(403)
    expect(fetchAdminViewportMapFeaturesWithClient).not.toHaveBeenCalled()
  })

  it('validates the viewport before performing authentication work', async () => {
    const response = await GET(request())

    expect(response.status).toBe(400)
    expect(requireAdmin).not.toHaveBeenCalled()
  })

  it('reports RPC failures', async () => {
    fetchAdminViewportMapFeaturesWithClient.mockRejectedValueOnce(new Error('database unavailable'))

    const response = await GET(request('?north=50&south=40&west=-10&east=0&zoom=12'))

    expect(response.status).toBe(500)
    expect(reportError).toHaveBeenCalled()
  })
})
