import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, test, vi } from 'vitest'

const mockCreateClient = vi.fn()

const { getAdminClientWithAudit } = vi.hoisted(() => ({
  getAdminClientWithAudit: vi.fn(() => mockCreateClient()),
}))

vi.mock('@/lib/supabase-server', () => ({
  getAdminClientWithAudit,
}))

vi.mock('@/lib/errors', () => ({
  reportError: vi.fn(),
}))

import { GET } from '@/app/api/crags/route-targets/route'

describe('GET /api/crags/route-targets', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  test('returns paged route target maps from the crag-scoped rpc', async () => {
    const createMockQuery = (data: unknown) => ({
      eq: () => createMockQuery(data),
      is: () => createMockQuery(data),
      in: () => createMockQuery(data),
      order: () => createMockQuery(data),
      then: (onFulfilled: (arg: { data: unknown; error: null }) => void) => onFulfilled({ data, error: null }),
      data,
      error: null,
    })

    const mockFrom = vi.fn((table: string) => {
      const tableData: Record<string, unknown[]> = {
        climbs: [{ id: 'climb-1', shared_climb_id: 'climb-1' }],
        route_lines: [
          { id: 'route-line-1', image_id: 'image-1', climb_id: 'climb-1', sequence_order: 1, created_at: new Date().toISOString() },
          { id: 'route-line-2', image_id: 'image-2', climb_id: 'climb-1', sequence_order: 2, created_at: new Date().toISOString() },
        ],
        images: [
          { id: 'image-1', url: 'https://example.com/image-1.jpg' },
          { id: 'image-2', url: 'https://example.com/image-2.jpg' },
        ],
      }
      return {
        select: () => createMockQuery(tableData[table] || []),
      }
    })

    mockCreateClient.mockReturnValue({ from: mockFrom })

    const response = await GET(
      new NextRequest('http://localhost:3000/api/crags/route-targets?cragId=11111111-1111-4111-8111-111111111111&limit=50&offset=0')
    )
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.routeImageIdsByClimbId).toEqual({
      'climb-1': ['image-1', 'image-2'],
    })
    expect(json.routePreviewByClimbId).toEqual({
      'climb-1': { imageId: 'image-1', imageUrl: 'https://example.com/image-1.jpg' },
    })
    expect(json.routeNavigationTargetByClimbId).toEqual({
      'climb-1': {
        climbId: 'climb-1',
        routeId: 'route-line-1',
        climbSlug: null,
        imageId: 'image-1',
        displayImageId: 'image-1',
        displayImageUrl: 'https://example.com/image-1.jpg',
      },
    })
    expect(json.defaultRouteTargetByImageId).toEqual({
      'image-1': {
        climbId: 'climb-1',
        routeId: 'route-line-1',
        climbSlug: null,
        imageId: 'image-1',
      },
      'image-2': {
        climbId: 'climb-1',
        routeId: 'route-line-2',
        climbSlug: null,
        imageId: 'image-2',
      },
    })
    expect(json.hasMore).toBe(false)
  })

  test('returns 400 for invalid crag ids', async () => {
    const response = await GET(new NextRequest('http://localhost:3000/api/crags/route-targets?cragId=bad-id'))
    expect(response.status).toBe(400)
  })
})