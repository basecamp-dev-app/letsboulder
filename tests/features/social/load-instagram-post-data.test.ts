import { beforeEach, describe, expect, test, vi } from 'vitest'

const getImageByDisplayIdMock = vi.fn()
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

    getImageByDisplayIdMock.mockResolvedValue({
      staticUrl: 'https://static.example.com/source.jpg',
      width: 1600,
      height: 900,
    })
  })

  test('loads image data without requiring a route identifier', async () => {
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
    })
  })
})
