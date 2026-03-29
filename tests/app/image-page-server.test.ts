import { beforeEach, describe, expect, test, vi } from 'vitest'

const cacheMock = <T extends (...args: unknown[]) => unknown>(fn: T) => fn

const state = {
  cragImageLookup: [] as unknown[],
  linkedCragImages: [] as unknown[],
  rawImage: null as Record<string, unknown> | null,
  routeLines: [] as unknown[],
  cragImagesForCrag: [] as unknown[],
}

vi.mock('react', () => ({ cache: cacheMock }))

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(() => ({
    from: (table: string) => ({
      select: (_cols?: string) => {
        void _cols
        if (table === 'crag_images') {
          return {
            or: () => ({
              order: async () => ({ data: state.cragImageLookup, error: null }),
            }),
            eq: (_column: string, value: string) => ({
              order: async () => ({
                data: value === state.rawImage?.id ? state.linkedCragImages : state.cragImagesForCrag,
                error: null,
              }),
            }),
          }
        }

        if (table === 'images') {
          return {
            eq: () => ({
              maybeSingle: async () => ({ data: state.rawImage, error: null }),
              order: async () => ({ data: [state.rawImage], error: null }),
            }),
          }
        }

        if (table === 'route_lines') {
          return {
            eq: () => ({
              order: () => ({
                order: async () => ({ data: state.routeLines, error: null }),
              }),
            }),
          }
        }

        throw new Error(`Unexpected table ${table}`)
      },
      eq: (_col: string, _val: unknown) => {
        void _col
        void _val
        if (table === 'images') {
          return {
            maybeSingle: async () => ({ data: state.rawImage, error: null }),
          }
        }
        throw new Error(`Unexpected table ${table}`)
      },
    }),
  })),
}))

describe('image-page-server raw image fallback', () => {
  beforeEach(() => {
    state.cragImageLookup = []
    state.linkedCragImages = []
    state.rawImage = {
      id: '215b8180-4727-404d-8fbf-6cb9bd8f5f9a',
      crag_id: 'crag-1',
      url: 'https://static.example.com/raw.jpg',
      width: 1200,
      height: 900,
      created_at: '2026-03-01T00:00:00Z',
      crags: {
        id: 'crag-1',
        slug: 'point-de-la-moye-east',
        country_code: 'GG',
        name: 'Point de la Moye East',
      },
    }
    state.routeLines = [
      {
        id: 'fd88f866-1eac-47a9-97c2-462574a95f55',
        climb_id: 'f9676bde-fbb2-4d90-a178-dec6cdb903f4',
        points: null,
        color: '#ef4444',
        image_width: null,
        image_height: null,
        sequence_order: 1,
        created_at: '2026-03-01T00:00:00Z',
        climbs: {
          id: 'f9676bde-fbb2-4d90-a178-dec6cdb903f4',
          name: 'Test Route',
          slug: 'test-route',
          grade: '6A',
          description: null,
          route_type: 'boulder',
          average_stars: null,
          star_votes: null,
        },
      },
    ]
    state.cragImagesForCrag = []
  })

  test('builds payload for raw images.id image-first route', async () => {
    const { buildImageFirstPayload } = await import('../../features/image-first/server/load-image-first-page')

    const result = await buildImageFirstPayload({
      country: 'gg',
      crag: 'point-de-la-moye-east',
      imageId: '215b8180-4727-404d-8fbf-6cb9bd8f5f9a',
      routeId: 'fd88f866-1eac-47a9-97c2-462574a95f55',
      routeSlug: 'fd88f866-1eac-47a9-97c2-462574a95f55',
      climbId: 'f9676bde-fbb2-4d90-a178-dec6cdb903f4',
    })

    expect(result.redirectTo).toBeNull()
    expect(result.payload?.heroImage.displayImageId).toBe('215b8180-4727-404d-8fbf-6cb9bd8f5f9a')
    expect(result.payload?.navigationContext.orderedImageIds).toEqual(['215b8180-4727-404d-8fbf-6cb9bd8f5f9a'])
    expect(result.payload?.initialRouteId).toBe('fd88f866-1eac-47a9-97c2-462574a95f55')
    expect(result.payload?.initialClimbId).toBe('f9676bde-fbb2-4d90-a178-dec6cdb903f4')
  })
})
