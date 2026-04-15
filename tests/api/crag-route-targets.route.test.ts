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
    const rpc = vi.fn(async (fnName: string, args: Record<string, unknown>) => {
      expect(fnName).toBe('get_crag_route_targets_page')
      expect(args).toEqual({
        p_crag_id: '11111111-1111-4111-8111-111111111111',
        p_limit: 50,
        p_offset: 0,
      })

      return {
        data: [
          {
            effective_climb_id: 'climb-1',
            climb_slug: 'route-one',
            preview_image_id: 'image-1',
            preview_image_url: 'https://example.com/image-1.jpg',
            navigation_route_id: 'route-line-1',
            navigation_image_id: 'image-1',
            navigation_image_url: 'https://example.com/image-1.jpg',
            route_image_ids: ['image-1', 'image-2'],
          },
        ],
        error: null,
      }
    })

    mockCreateClient.mockReturnValue({ rpc })

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
        climbSlug: 'route-one',
        imageId: 'image-1',
        displayImageId: 'image-1',
        displayImageUrl: 'https://example.com/image-1.jpg',
      },
    })
    expect(json.defaultRouteTargetByImageId).toEqual({
      'image-1': {
        climbId: 'climb-1',
        routeId: 'route-line-1',
        climbSlug: 'route-one',
        imageId: 'image-1',
      },
    })
    expect(json.hasMore).toBe(false)
  })

  test('returns 400 for invalid crag ids', async () => {
    const response = await GET(new NextRequest('http://localhost:3000/api/crags/route-targets?cragId=bad-id'))
    expect(response.status).toBe(400)
  })
})
