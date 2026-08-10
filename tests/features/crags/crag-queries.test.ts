import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchCragImages } from '@/features/crags/lib/crag-queries'

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  loadPublicCragMapImages: vi.fn(),
  fetchCragRouteTargetPage: vi.fn(),
}))

vi.mock('@/lib/supabase', () => ({ createClient: mocks.createClient }))
vi.mock('@/features/crags/lib/crag-map-images', () => ({ loadPublicCragMapImages: mocks.loadPublicCragMapImages }))
vi.mock('@/features/crags/lib/crag-route-targets', async () => {
  const actual = await vi.importActual<typeof import('@/features/crags/lib/crag-route-targets')>('@/features/crags/lib/crag-route-targets')
  return { ...actual, fetchCragRouteTargetPage: mocks.fetchCragRouteTargetPage }
})

describe('fetchCragImages', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('loads current metadata and route targets alongside current images', async () => {
    const single = vi.fn(async () => ({
      data: {
        id: 'crag-1', name: 'Renamed Crag', slug: 'renamed-crag', country_code: 'GB', latitude: 51, longitude: 0.1,
        region_id: null, description: null, access_notes: null, rock_type: null, type: null,
      },
      error: null,
    }))
    const builder = { select: vi.fn(() => builder), eq: vi.fn(() => builder), single }
    const supabase = { from: vi.fn(() => builder) }
    mocks.createClient.mockReturnValue(supabase)
    mocks.loadPublicCragMapImages.mockResolvedValue([])
    mocks.fetchCragRouteTargetPage.mockResolvedValue({
      nextDefaultRouteTargetByImageId: { 'image-1': { climbId: 'climb-1', routeId: 'route-1', climbSlug: 'route-1', imageId: 'image-1' } },
      nextRouteImageIdsByClimbId: { 'climb-1': ['image-1'] },
      nextRoutePreviewByClimbId: { 'climb-1': { imageId: 'image-1', imageUrl: 'https://example.com/image.jpg' } },
      nextRouteNavigationTargetByClimbId: {
        'climb-1': { climbId: 'climb-1', routeId: 'route-1', climbSlug: 'route-1', imageId: 'image-1', displayImageId: 'image-1', displayImageUrl: 'https://example.com/image.jpg' },
      },
    })

    const result = await fetchCragImages('crag-1')

    expect(result.crag.name).toBe('Renamed Crag')
    expect(result.routeNavigationTargetByClimbId['climb-1']?.routeId).toBe('route-1')
    expect(mocks.fetchCragRouteTargetPage).toHaveBeenCalledWith(supabase, 'crag-1', 1000000, 0)
  })
})
