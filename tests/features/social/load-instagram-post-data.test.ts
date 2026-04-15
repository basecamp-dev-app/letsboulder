import { beforeEach, describe, expect, test, vi } from 'vitest'

const getImageByDisplayIdMock = vi.fn()
const getRoutesByImageMock = vi.fn()
const state = {
  crag: {
    id: 'crag-1',
    name: 'Harrison\'s Rocks',
    slug: 'harrisons-rocks',
    country_code: 'GB',
    region_name: 'East Sussex',
  },
}

vi.mock('@/features/image-first/server/load-image-first-page', () => ({
  getImageByDisplayId: getImageByDisplayIdMock,
  getRoutesByImage: getRoutesByImageMock,
}))

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(() => ({
    from: (table: string) => ({
      select: () => {
        const query = {
          eq: vi.fn(() => query),
          maybeSingle: vi.fn(async () => {
            if (table !== 'crags') {
              throw new Error(`Unexpected table ${table}`)
            }

            return { data: state.crag, error: null }
          }),
        }

        return query
      },
    }),
  })),
}))

describe('loadInstagramPostData', () => {
  beforeEach(() => {
    getImageByDisplayIdMock.mockReset()
    getRoutesByImageMock.mockReset()

    getImageByDisplayIdMock.mockResolvedValue({
      staticUrl: 'https://static.example.com/source.jpg',
      width: 1600,
      height: 900,
    })

    getRoutesByImageMock.mockResolvedValue([
      {
        id: 'route-line-1',
        climb_id: 'climb-1',
        points: JSON.stringify([{ x: 160, y: 90 }, { x: 800, y: 450 }, { x: 1440, y: 810 }]),
        color: '#22c55e',
        image_width: 1600,
        image_height: 900,
        sequence_order: 1,
        created_at: '2026-04-15T00:00:00Z',
        climbs: {
          slug: 'flakes-direct',
        },
      },
      {
        id: 'route-line-2',
        climb_id: 'climb-2',
        points: JSON.stringify([{ x: 320, y: 180 }, { x: 960, y: 540 }]),
        color: '#ef4444',
        image_width: 1600,
        image_height: 900,
        sequence_order: 2,
        created_at: '2026-04-15T00:00:01Z',
        climbs: {
          slug: 'another-route',
        },
      },
    ])
  })

  test('loads image data and all available routes without requiring a route identifier', async () => {
    const { loadInstagramPostData } = await import('@/features/social/server/load-instagram-post-data')

    const result = await loadInstagramPostData({
      country: 'gb',
      crag: 'harrisons-rocks',
      imageId: 'image-1',
    })

    expect(result).toEqual({
      imageUrl: 'https://static.example.com/source.jpg',
      naturalWidth: 1600,
      naturalHeight: 900,
      routes: [
        {
          routeId: 'route-line-1',
          routePoints: [
            { x: 0.1, y: 0.1 },
            { x: 0.5, y: 0.5 },
            { x: 0.9, y: 0.9 },
          ],
          strokeColor: '#dc2626',
          isSelected: false,
        },
        {
          routeId: 'route-line-2',
          routePoints: [
            { x: 0.2, y: 0.2 },
            { x: 0.6, y: 0.6 },
          ],
          strokeColor: '#dc2626',
          isSelected: false,
        },
      ],
    })
  })

  test('highlights the selected route when a route identifier is provided', async () => {
    const { loadInstagramPostData } = await import('@/features/social/server/load-instagram-post-data')

    const result = await loadInstagramPostData({
      country: 'gb',
      crag: 'harrisons-rocks',
      imageId: 'image-1',
      routeIdentifier: 'flakes-direct',
    })

    expect(result?.routes[0]).toEqual({
      routeId: 'route-line-1',
      routePoints: [
        { x: 0.1, y: 0.1 },
        { x: 0.5, y: 0.5 },
        { x: 0.9, y: 0.9 },
      ],
      strokeColor: '#00FFFF',
      isSelected: true,
    })
    expect(result?.routes[1]?.isSelected).toBe(false)
  })
})
