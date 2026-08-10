import { describe, expect, it, vi, beforeEach } from 'vitest'
import { loadInitialCragRouteData } from '@/features/crags/server/load-initial-crag-route-data'

vi.mock('@/lib/supabase-admin', () => ({
  getAdminClientWithAudit: vi.fn(),
}))

vi.mock('@/features/crags/lib/crag-route-targets', async () => {
  const actual = await vi.importActual<typeof import('@/features/crags/lib/crag-route-targets')>('@/features/crags/lib/crag-route-targets')
  return {
    ...actual,
    fetchCragRoutePreviewsBatched: vi.fn(),
  }
})

vi.mock('@/features/crags/lib/crag-map-images', () => ({
  loadPublicCragMapImages: vi.fn(),
}))

type QueryResult = { data?: unknown; error?: unknown }

function createSelectBuilder(result: QueryResult) {
  const terminal = { data: result.data || null, error: result.error || null }
  const chain = {
    eq: vi.fn(() => chain),
    in: vi.fn(() => chain),
    order: vi.fn(() => chain),
    limit: vi.fn(async () => terminal),
    then: undefined as unknown,
  }

  chain.then = (onFulfilled: (value: typeof terminal) => unknown, onRejected?: (reason: unknown) => unknown) =>
    Promise.resolve(terminal).then(onFulfilled, onRejected)

  return chain
}

function createRouteIntelligenceRow() {
  return {
    id: 'climb-1',
    name: 'Route 1',
    grade: '6A',
    slug: 'route-1',
    route_type: 'boulder',
    directions: ['N'],
    has_topo: true,
    topo_image_count: 1,
    rating_avg: 4,
    rating_count: 1,
    weighted_rating: 4,
    send_count: 1,
    recent_send_count_60d: 1,
  }
}

function createMapImage(id: string, latitude: number, longitude: number) {
  return {
    id,
    url: `https://example.com/${id}.jpg`,
    storageUrl: `https://example.com/${id}.jpg`,
    latitude,
    longitude,
    route_lines_count: 0,
    is_verified: false,
    verification_count: 0,
    supplementary_faces_count: 0,
    map_primary_image_id: id,
  }
}

describe('loadInitialCragRouteData', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    const { loadPublicCragMapImages } = await import('@/features/crags/lib/crag-map-images')
    vi.mocked(loadPublicCragMapImages).mockResolvedValue([])
  })

  it('hydrates exact route counts for route-critical images', async () => {
    const imagesSelect = createSelectBuilder({
      data: [
        { id: 'image-1', url: 'https://example.com/1.jpg', latitude: 51.0, longitude: 0.1 },
      ],
    })

    const routeLinesSelect = createSelectBuilder({
      data: [
        { image_id: 'image-1' },
        { image_id: 'image-1' },
      ],
    })

    const climbsSelect = createSelectBuilder({
      data: [
        { id: 'climb-1', shared_climb_id: null },
      ],
    })

    const supabase = {
      rpc: vi.fn(async (fnName: string) => {
        if (fnName === 'get_crag_route_intelligence') {
          return {
            data: [{
              id: 'climb-1',
              name: 'Route 1',
              grade: '6A',
              slug: 'route-1',
              route_type: 'boulder',
              directions: ['N'],
              has_topo: true,
              topo_image_count: 1,
              rating_avg: 4,
              rating_count: 1,
              weighted_rating: 4,
              send_count: 1,
              recent_send_count_60d: 1,
            }],
            error: null,
          }
        }

        return { data: null, error: null }
      }),
      from: vi.fn((table: string) => {
        if (table === 'images') return { select: vi.fn(() => imagesSelect) }
        if (table === 'route_lines') return { select: vi.fn(() => routeLinesSelect) }
        if (table === 'climbs') return { select: vi.fn(() => climbsSelect) }
        throw new Error(`Unexpected table: ${table}`)
      }),
    }

    const previewSupabase = {
      from: vi.fn((table: string) => {
        if (table === 'route_lines') {
          return {
            select: vi.fn(() => createSelectBuilder({
              data: [
                { image_id: 'image-2' },
              ],
            })),
          }
        }

        if (table === 'images') {
          return {
            select: vi.fn(() => createSelectBuilder({
              data: [
                { id: 'image-2', url: 'https://example.com/2.jpg', latitude: 51.1, longitude: 0.2 },
              ],
            })),
          }
        }

        throw new Error(`Unexpected preview table: ${table}`)
      }),
    }

    const { getAdminClientWithAudit } = await import('@/lib/supabase-admin')
    vi.mocked(getAdminClientWithAudit).mockReturnValue(previewSupabase as never)

    const { fetchCragRoutePreviewsBatched } = await import('@/features/crags/lib/crag-route-targets')
    vi.mocked(fetchCragRoutePreviewsBatched).mockResolvedValue({
      nextRouteImageIdsByClimbId: { 'climb-1': ['image-2'] },
      nextRoutePreviewByClimbId: { 'climb-1': { imageId: 'image-2', imageUrl: 'https://example.com/2.jpg' } },
      nextDefaultRouteTargetByImageId: {},
      nextRouteNavigationTargetByClimbId: {},
    })

    const result = await loadInitialCragRouteData(supabase as never, 'crag-1')

    expect(result.initialImages).toEqual([
      expect.objectContaining({ id: 'image-2', route_lines_count: 1 }),
    ])
    expect(result.initialCriticalImagesComplete).toBe(true)
  })

  it('keeps critical images complete even when a seeded preview image cannot be hydrated', async () => {
    const imagesSelect = createSelectBuilder({
      data: [
        { id: 'image-1', url: 'https://example.com/1.jpg', latitude: 51.0, longitude: 0.1 },
      ],
    })

    const routeLinesSelect = createSelectBuilder({
      data: [
        { image_id: 'image-1' },
      ],
    })

    const climbsSelect = createSelectBuilder({
      data: [
        { id: 'climb-1', shared_climb_id: null },
      ],
    })

    const supabase = {
      rpc: vi.fn(async () => ({
        data: [{
          id: 'climb-1',
          name: 'Route 1',
          grade: '6A',
          slug: 'route-1',
          route_type: 'boulder',
          directions: ['N'],
          has_topo: true,
          topo_image_count: 1,
          rating_avg: 4,
          rating_count: 1,
          weighted_rating: 4,
          send_count: 1,
          recent_send_count_60d: 1,
        }],
        error: null,
      })),
      from: vi.fn((table: string) => {
        if (table === 'images') return { select: vi.fn(() => imagesSelect) }
        if (table === 'route_lines') return { select: vi.fn(() => routeLinesSelect) }
        if (table === 'climbs') return { select: vi.fn(() => climbsSelect) }
        throw new Error(`Unexpected table: ${table}`)
      }),
    }

    const previewSupabase = {
      from: vi.fn((table: string) => {
        if (table === 'route_lines') {
          return {
            select: vi.fn(() => createSelectBuilder({
              data: [
                { image_id: 'image-2' },
              ],
            })),
          }
        }

        if (table === 'images') {
          return {
            select: vi.fn(() => createSelectBuilder({
              data: [],
            })),
          }
        }

        throw new Error(`Unexpected preview table: ${table}`)
      }),
    }

    const { getAdminClientWithAudit } = await import('@/lib/supabase-admin')
    vi.mocked(getAdminClientWithAudit).mockReturnValue(previewSupabase as never)

    const { fetchCragRoutePreviewsBatched } = await import('@/features/crags/lib/crag-route-targets')
    vi.mocked(fetchCragRoutePreviewsBatched).mockResolvedValue({
      nextRouteImageIdsByClimbId: { 'climb-1': ['image-2'] },
      nextRoutePreviewByClimbId: { 'climb-1': { imageId: 'image-2', imageUrl: 'https://example.com/2.jpg' } },
      nextDefaultRouteTargetByImageId: {},
      nextRouteNavigationTargetByClimbId: {},
    })

    const result = await loadInitialCragRouteData(supabase as never, 'crag-1')

    expect(result.initialImages).toHaveLength(0)
    expect(result.initialCriticalImagesComplete).toBe(true)
  })

  it('marks critical images complete when seeded previews already use the initial image set', async () => {
    const imagesSelect = createSelectBuilder({
      data: [
        { id: 'image-1', url: 'https://example.com/1.jpg', latitude: 51.0, longitude: 0.1 },
      ],
    })

    const routeLinesSelect = createSelectBuilder({
      data: [
        { image_id: 'image-1' },
      ],
    })

    const climbsSelect = createSelectBuilder({
      data: [
        { id: 'climb-1', shared_climb_id: null },
      ],
    })

    const supabase = {
      rpc: vi.fn(async () => ({
        data: [{
          id: 'climb-1',
          name: 'Route 1',
          grade: '6A',
          slug: 'route-1',
          route_type: 'boulder',
          directions: ['N'],
          has_topo: true,
          topo_image_count: 1,
          rating_avg: 4,
          rating_count: 1,
          weighted_rating: 4,
          send_count: 1,
          recent_send_count_60d: 1,
        }],
        error: null,
      })),
      from: vi.fn((table: string) => {
        if (table === 'images') return { select: vi.fn(() => imagesSelect) }
        if (table === 'route_lines') return { select: vi.fn(() => routeLinesSelect) }
        if (table === 'climbs') return { select: vi.fn(() => climbsSelect) }
        throw new Error(`Unexpected table: ${table}`)
      }),
    }

    const { getAdminClientWithAudit } = await import('@/lib/supabase-admin')
    vi.mocked(getAdminClientWithAudit).mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === 'route_lines') return { select: vi.fn(() => routeLinesSelect) }
        if (table === 'images') return { select: vi.fn(() => createSelectBuilder({ data: [] })) }
        throw new Error(`Unexpected preview table: ${table}`)
      }),
    } as never)

    const { fetchCragRoutePreviewsBatched } = await import('@/features/crags/lib/crag-route-targets')
    vi.mocked(fetchCragRoutePreviewsBatched).mockResolvedValue({
      nextRouteImageIdsByClimbId: { 'climb-1': ['image-1'] },
      nextRoutePreviewByClimbId: { 'climb-1': { imageId: 'image-1', imageUrl: 'https://example.com/1.jpg' } },
      nextDefaultRouteTargetByImageId: {},
      nextRouteNavigationTargetByClimbId: {},
    })

    const result = await loadInitialCragRouteData(supabase as never, 'crag-1')

    expect(result.initialCriticalImagesComplete).toBe(true)
  })

  it('returns image-only map images when route targets exist', async () => {
    const imagesSelect = createSelectBuilder({
      data: [
        { id: 'image-1', url: 'https://example.com/1.jpg', latitude: 51.0, longitude: 0.1 },
        { id: 'image-2', url: 'https://example.com/2.jpg', latitude: 51.1, longitude: 0.2 },
      ],
    })

    const routeLinesSelect = createSelectBuilder({
      data: [
        { image_id: 'image-2' },
      ],
    })

    const climbsSelect = createSelectBuilder({
      data: [
        { id: 'climb-1', shared_climb_id: null },
      ],
    })

    const supabase = {
      rpc: vi.fn(async () => ({
        data: [{
          id: 'climb-1',
          name: 'Route 1',
          grade: '6A',
          slug: 'route-1',
          route_type: 'boulder',
          directions: ['N'],
          has_topo: true,
          topo_image_count: 1,
          rating_avg: 4,
          rating_count: 1,
          weighted_rating: 4,
          send_count: 1,
          recent_send_count_60d: 1,
        }],
        error: null,
      })),
      from: vi.fn((table: string) => {
        if (table === 'images') return { select: vi.fn(() => imagesSelect) }
        if (table === 'route_lines') return { select: vi.fn(() => routeLinesSelect) }
        if (table === 'climbs') return { select: vi.fn(() => climbsSelect) }
        throw new Error(`Unexpected table: ${table}`)
      }),
    }

    const { getAdminClientWithAudit } = await import('@/lib/supabase-admin')
    vi.mocked(getAdminClientWithAudit).mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === 'route_lines') return { select: vi.fn(() => routeLinesSelect) }
        if (table === 'images') return { select: vi.fn(() => createSelectBuilder({ data: [] })) }
        throw new Error(`Unexpected preview table: ${table}`)
      }),
    } as never)

    const { fetchCragRoutePreviewsBatched } = await import('@/features/crags/lib/crag-route-targets')
    vi.mocked(fetchCragRoutePreviewsBatched).mockResolvedValue({
      nextRouteImageIdsByClimbId: { 'climb-1': ['image-2'] },
      nextRoutePreviewByClimbId: { 'climb-1': { imageId: 'image-2', imageUrl: 'https://example.com/2.jpg' } },
      nextDefaultRouteTargetByImageId: {},
      nextRouteNavigationTargetByClimbId: {
        'climb-1': {
          climbId: 'climb-1',
          routeId: 'route-line-1',
          climbSlug: 'route-1',
          imageId: 'image-2',
          displayImageId: 'image-2',
          displayImageUrl: 'https://example.com/2.jpg',
        },
      },
    })
    const { loadPublicCragMapImages } = await import('@/features/crags/lib/crag-map-images')
    vi.mocked(loadPublicCragMapImages).mockResolvedValue([
      createMapImage('image-1', 51, 0.1),
      createMapImage('image-2', 51.1, 0.2),
    ])

    const result = await loadInitialCragRouteData(supabase as never, 'crag-1')

    expect(result.initialImages.map((image) => image.id)).toEqual(['image-1', 'image-2'])
    expect(result.initialMapImagesComplete).toBe(false)
  })

  it('includes the selected image in the critical SSR image set', async () => {
    const imagesSelect = createSelectBuilder({
      data: [
        { id: 'image-1', url: 'https://example.com/1.jpg', latitude: 51.0, longitude: 0.1 },
        { id: 'image-2', url: 'https://example.com/2.jpg', latitude: 51.1, longitude: 0.2 },
      ],
    })

    const routeLinesSelect = createSelectBuilder({
      data: [
        { image_id: 'image-1' },
      ],
    })

    const climbsSelect = createSelectBuilder({
      data: [
        { id: 'climb-1', shared_climb_id: null },
      ],
    })

    const supabase = {
      rpc: vi.fn(async () => ({
        data: [{
          id: 'climb-1',
          name: 'Route 1',
          grade: '6A',
          slug: 'route-1',
          route_type: 'boulder',
          directions: ['N'],
          has_topo: true,
          topo_image_count: 1,
          rating_avg: 4,
          rating_count: 1,
          weighted_rating: 4,
          send_count: 1,
          recent_send_count_60d: 1,
        }],
        error: null,
      })),
      from: vi.fn((table: string) => {
        if (table === 'images') return { select: vi.fn(() => imagesSelect) }
        if (table === 'route_lines') return { select: vi.fn(() => routeLinesSelect) }
        if (table === 'climbs') return { select: vi.fn(() => climbsSelect) }
        throw new Error(`Unexpected table: ${table}`)
      }),
    }

    const { getAdminClientWithAudit } = await import('@/lib/supabase-admin')
    vi.mocked(getAdminClientWithAudit).mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === 'route_lines') return { select: vi.fn(() => routeLinesSelect) }
        if (table === 'images') return { select: vi.fn(() => createSelectBuilder({ data: [] })) }
        throw new Error(`Unexpected preview table: ${table}`)
      }),
    } as never)

    const { fetchCragRoutePreviewsBatched } = await import('@/features/crags/lib/crag-route-targets')
    vi.mocked(fetchCragRoutePreviewsBatched).mockResolvedValue({
      nextRouteImageIdsByClimbId: { 'climb-1': ['image-1'] },
      nextRoutePreviewByClimbId: { 'climb-1': { imageId: 'image-1', imageUrl: 'https://example.com/1.jpg' } },
      nextDefaultRouteTargetByImageId: {},
      nextRouteNavigationTargetByClimbId: {},
    })
    const { loadPublicCragMapImages } = await import('@/features/crags/lib/crag-map-images')
    vi.mocked(loadPublicCragMapImages).mockResolvedValue([
      createMapImage('image-1', 51, 0.1),
      createMapImage('image-2', 51.1, 0.2),
    ])

    const result = await loadInitialCragRouteData(supabase as never, 'crag-1', undefined, undefined, 'image-2')

    expect(result.initialImages.map((image) => image.id)).toEqual(['image-1', 'image-2'])
    expect(result.initialCriticalImagesComplete).toBe(true)
  })

  it('seeds recent images for crags without routes', async () => {
    const imagesSelect = createSelectBuilder({
      data: [
        { id: 'image-1', url: 'https://example.com/1.jpg', latitude: 51.0, longitude: 0.1 },
        { id: 'image-2', url: 'https://example.com/2.jpg', latitude: 51.1, longitude: 0.2 },
      ],
    })

    const supabase = {
      rpc: vi.fn(async () => ({ data: [], error: null })),
      from: vi.fn((table: string) => {
        if (table === 'images') return { select: vi.fn(() => imagesSelect) }
        if (table === 'climbs') return { select: vi.fn(() => createSelectBuilder({ data: [] })) }
        throw new Error(`Unexpected table: ${table}`)
      }),
    }

    const { loadPublicCragMapImages } = await import('@/features/crags/lib/crag-map-images')
    vi.mocked(loadPublicCragMapImages).mockResolvedValue([
      createMapImage('image-1', 51, 0.1),
      createMapImage('image-2', 51.1, 0.2),
    ])

    const result = await loadInitialCragRouteData(supabase as never, 'crag-1')

    expect(result.initialImages.map((image) => image.id)).toEqual(['image-1', 'image-2'])
    expect(result.initialCriticalImagesComplete).toBe(true)
    expect(result.initialRouteTargetsComplete).toBe(true)
  })

  it('throws route intelligence errors instead of returning an empty crag', async () => {
    const queryError = new Error('routes unavailable')
    const supabase = {
      rpc: vi.fn(async () => ({ data: null, error: queryError })),
      from: vi.fn(() => ({ select: vi.fn(() => createSelectBuilder({ data: [] })) })),
    }

    await expect(loadInitialCragRouteData(supabase as never, 'crag-1')).rejects.toBe(queryError)
  })

  it('throws initial image errors instead of returning an empty crag', async () => {
    const queryError = new Error('images unavailable')
    const supabase = {
      rpc: vi.fn(async () => ({ data: [], error: null })),
      from: vi.fn(() => ({ select: vi.fn(() => createSelectBuilder({ error: queryError })) })),
    }

    const { loadPublicCragMapImages } = await import('@/features/crags/lib/crag-map-images')
    vi.mocked(loadPublicCragMapImages).mockRejectedValue(queryError)

    await expect(loadInitialCragRouteData(supabase as never, 'crag-1')).rejects.toBe(queryError)
  })

  it('throws climb identity errors instead of skipping route deduplication', async () => {
    const queryError = new Error('climb identities unavailable')
    const supabase = {
      rpc: vi.fn(async () => ({ data: [createRouteIntelligenceRow()], error: null })),
      from: vi.fn((table: string) => {
        if (table === 'images') return { select: vi.fn(() => createSelectBuilder({ data: [] })) }
        if (table === 'climbs') return { select: vi.fn(() => createSelectBuilder({ error: queryError })) }
        throw new Error(`Unexpected table: ${table}`)
      }),
    }

    await expect(loadInitialCragRouteData(supabase as never, 'crag-1')).rejects.toBe(queryError)
  })

  it('throws critical route-line count errors instead of reporting zero counts', async () => {
    const queryError = new Error('route lines unavailable')
    const supabase = {
      rpc: vi.fn(async () => ({ data: [createRouteIntelligenceRow()], error: null })),
      from: vi.fn((table: string) => {
        if (table === 'images') return { select: vi.fn(() => createSelectBuilder({ data: [] })) }
        if (table === 'climbs') return { select: vi.fn(() => createSelectBuilder({ data: [{ id: 'climb-1', shared_climb_id: null }] })) }
        throw new Error(`Unexpected table: ${table}`)
      }),
    }
    const previewSupabase = {
      from: vi.fn(() => ({ select: vi.fn(() => createSelectBuilder({ error: queryError })) })),
    }
    const { getAdminClientWithAudit } = await import('@/lib/supabase-admin')
    vi.mocked(getAdminClientWithAudit).mockReturnValue(previewSupabase as never)
    const { fetchCragRoutePreviewsBatched } = await import('@/features/crags/lib/crag-route-targets')
    vi.mocked(fetchCragRoutePreviewsBatched).mockResolvedValue({
      nextRouteImageIdsByClimbId: { 'climb-1': ['image-2'] },
      nextRoutePreviewByClimbId: { 'climb-1': { imageId: 'image-2', imageUrl: 'https://example.com/2.jpg' } },
      nextDefaultRouteTargetByImageId: {},
      nextRouteNavigationTargetByClimbId: {},
    })

    await expect(loadInitialCragRouteData(supabase as never, 'crag-1')).rejects.toBe(queryError)
  })

  it('throws critical image hydration errors instead of reporting complete images', async () => {
    const queryError = new Error('critical images unavailable')
    const supabase = {
      rpc: vi.fn(async () => ({ data: [createRouteIntelligenceRow()], error: null })),
      from: vi.fn((table: string) => {
        if (table === 'images') return { select: vi.fn(() => createSelectBuilder({ data: [] })) }
        if (table === 'climbs') return { select: vi.fn(() => createSelectBuilder({ data: [{ id: 'climb-1', shared_climb_id: null }] })) }
        throw new Error(`Unexpected table: ${table}`)
      }),
    }
    const previewSupabase = {
      from: vi.fn((table: string) => {
        if (table === 'route_lines') return { select: vi.fn(() => createSelectBuilder({ data: [] })) }
        if (table === 'images') return { select: vi.fn(() => createSelectBuilder({ error: queryError })) }
        throw new Error(`Unexpected preview table: ${table}`)
      }),
    }
    const { getAdminClientWithAudit } = await import('@/lib/supabase-admin')
    vi.mocked(getAdminClientWithAudit).mockReturnValue(previewSupabase as never)
    const { fetchCragRoutePreviewsBatched } = await import('@/features/crags/lib/crag-route-targets')
    vi.mocked(fetchCragRoutePreviewsBatched).mockResolvedValue({
      nextRouteImageIdsByClimbId: { 'climb-1': ['image-2'] },
      nextRoutePreviewByClimbId: { 'climb-1': { imageId: 'image-2', imageUrl: 'https://example.com/2.jpg' } },
      nextDefaultRouteTargetByImageId: {},
      nextRouteNavigationTargetByClimbId: {},
    })

    await expect(loadInitialCragRouteData(supabase as never, 'crag-1')).rejects.toBe(queryError)
  })
})
