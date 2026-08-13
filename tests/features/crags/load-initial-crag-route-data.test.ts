import { beforeEach, describe, expect, it, vi } from 'vitest'

import { loadInitialCragRouteData } from '@/features/crags/server/load-initial-crag-route-data'

vi.mock('@/features/crags/lib/crag-map-images', () => ({ loadPublicCragMapImages: vi.fn() }))
vi.mock('@/features/crags/lib/crag-route-targets', async () => {
  const actual = await vi.importActual<typeof import('@/features/crags/lib/crag-route-targets')>('@/features/crags/lib/crag-route-targets')
  return { ...actual, fetchCragRoutePreviewsBatched: vi.fn() }
})

function builder(data: unknown, error: unknown = null) {
  const result = { data, error }
  const chain = {
    eq: vi.fn(() => chain), in: vi.fn(() => chain), order: vi.fn(() => chain),
    then: undefined as unknown,
  }
  chain.then = (resolve: (value: typeof result) => unknown, reject?: (reason: unknown) => unknown) => Promise.resolve(result).then(resolve, reject)
  return chain
}

const route = {
  id: 'climb-1', name: 'Route 1', grade: '6A', slug: 'route-1', route_type: 'boulder', directions: ['N'],
  has_topo: true, topo_image_count: 1, rating_avg: 4, rating_count: 1, weighted_rating: 4, send_count: 1, recent_send_count_60d: 1,
}

function createClient(images: unknown[] = [{ id: 'image-1', url: 'https://example.com/1.jpg', latitude: 51, longitude: 0.1 }]) {
  const routeLines = builder([{ image_id: 'image-1' }])
  return {
    rpc: vi.fn(async () => ({ data: [route], error: null })),
    from: vi.fn((table: string) => ({ select: vi.fn(() => {
      if (table === 'climbs') return builder([{ id: 'climb-1', shared_climb_id: null }])
      if (table === 'route_lines') return routeLines
      if (table === 'images') return builder(images)
      throw new Error(`Unexpected table: ${table}`)
    }) })),
  }
}

describe('loadInitialCragRouteData', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    const { loadPublicCragMapImages } = await import('@/features/crags/lib/crag-map-images')
    vi.mocked(loadPublicCragMapImages).mockResolvedValue([])
  })

  it('uses the supplied client for public target, count, and hydration reads', async () => {
    const client = createClient()
    const { fetchCragRoutePreviewsBatched } = await import('@/features/crags/lib/crag-route-targets')
    vi.mocked(fetchCragRoutePreviewsBatched).mockResolvedValue({
      nextRouteImageIdsByClimbId: { 'climb-1': ['image-1'] },
      nextRoutePreviewByClimbId: { 'climb-1': { imageId: 'image-1', imageUrl: 'ignored' } },
      nextDefaultRouteTargetByImageId: { 'image-1': { imageId: 'image-1', climbId: 'climb-1', routeId: 'line-1', climbSlug: 'route-1' } },
      nextRouteNavigationTargetByClimbId: { 'climb-1': { imageId: 'image-1', displayImageId: 'image-1', displayImageUrl: 'ignored', climbId: 'climb-1', routeId: 'line-1', climbSlug: 'route-1' } },
    })

    const result = await loadInitialCragRouteData(client as never, 'crag-1')

    expect(fetchCragRoutePreviewsBatched).toHaveBeenCalledWith(client, 'crag-1', { 'climb-1': 'climb-1' }, { limit: undefined })
    expect(client.from).toHaveBeenCalledWith('route_lines')
    expect(result.initialImages).toEqual([expect.objectContaining({ id: 'image-1', route_lines_count: 1 })])
    expect(result.initialRouteTargetsComplete).toBe(true)
    expect(result.initialCriticalImagesComplete).toBe(true)
  })

  it('removes unavailable target image metadata and marks both completion flags incomplete', async () => {
    const client = createClient([])
    const { fetchCragRoutePreviewsBatched } = await import('@/features/crags/lib/crag-route-targets')
    vi.mocked(fetchCragRoutePreviewsBatched).mockResolvedValue({
      nextRouteImageIdsByClimbId: { 'climb-1': ['unavailable'] },
      nextRoutePreviewByClimbId: { 'climb-1': { imageId: 'unavailable', imageUrl: 'fallback-must-not-survive' } },
      nextDefaultRouteTargetByImageId: { unavailable: { imageId: 'unavailable', climbId: 'climb-1', routeId: 'line-1', climbSlug: 'route-1' } },
      nextRouteNavigationTargetByClimbId: { 'climb-1': { imageId: 'unavailable', displayImageId: 'unavailable', displayImageUrl: 'fallback-must-not-survive', climbId: 'climb-1', routeId: 'line-1', climbSlug: 'route-1' } },
    })

    const result = await loadInitialCragRouteData(client as never, 'crag-1')

    expect(result.initialRouteImageIdsByClimbId).toEqual({})
    expect(result.initialRoutePreviewByClimbId).toEqual({})
    expect(result.initialDefaultRouteTargetByImageId).toEqual({})
    expect(result.initialRouteNavigationTargetByClimbId).toEqual({})
    expect(result.initialRouteTargetsComplete).toBe(false)
    expect(result.initialCriticalImagesComplete).toBe(false)
  })

  it('keeps the selected public image in the critical SSR set', async () => {
    const client = createClient([{ id: 'selected', url: 'https://example.com/selected.jpg', latitude: 51, longitude: 0.1 }])
    const { fetchCragRoutePreviewsBatched } = await import('@/features/crags/lib/crag-route-targets')
    vi.mocked(fetchCragRoutePreviewsBatched).mockResolvedValue({
      nextRouteImageIdsByClimbId: {}, nextRoutePreviewByClimbId: {}, nextDefaultRouteTargetByImageId: {}, nextRouteNavigationTargetByClimbId: {},
    })

    const result = await loadInitialCragRouteData(client as never, 'crag-1', undefined, undefined, 'selected')
    expect(result.initialImages).toEqual([expect.objectContaining({ id: 'selected' })])
    expect(result.initialCriticalImagesComplete).toBe(true)
  })

  it('propagates public read failures', async () => {
    const error = new Error('routes unavailable')
    const client = createClient()
    client.rpc.mockResolvedValue({ data: null, error })

    await expect(loadInitialCragRouteData(client as never, 'crag-1')).rejects.toBe(error)
  })
})
