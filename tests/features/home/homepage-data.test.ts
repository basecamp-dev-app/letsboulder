import { describe, expect, test, vi } from 'vitest'

const { getUnauthenticatedClient } = vi.hoisted(() => ({
  getUnauthenticatedClient: vi.fn(),
}))

vi.mock('react', () => ({
  cache: <T extends (...args: never[]) => unknown>(fn: T) => {
    const results = new Map<string, ReturnType<T>>()
    return (...args: Parameters<T>) => {
      const key = JSON.stringify(args)
      if (!results.has(key)) results.set(key, fn(...args) as ReturnType<T>)
      return results.get(key)
    }
  },
}))

vi.mock('@/lib/supabase-server', () => ({ getUnauthenticatedClient }))

function createImagesQuery() {
  const query = {
    in: vi.fn(() => query),
    not: vi.fn(() => query),
    order: vi.fn(() => query),
    limit: vi.fn(async () => ({
      data: [{
        id: 'image-1',
        url: 'https://static.letsboulder.com/image.jpg',
        created_at: '2026-08-26T10:00:00.000Z',
        crag_id: 'crag-1',
        created_by: 'user-1',
        crags: { id: 'crag-1', name: 'Test Crag', slug: 'test-crag', country_code: 'GB' },
      }],
      error: null,
    })),
  }
  return query
}

describe('homepage public data', () => {
  test('shares the recent image query across crag and contributor sections', async () => {
    const imagesQuery = createImagesQuery()
    const from = vi.fn((table: string) => {
      if (table === 'images') return { select: vi.fn(() => imagesQuery) }
      if (table === 'profiles') {
        return {
          select: vi.fn(() => ({
            in: vi.fn(() => ({
              eq: vi.fn(async () => ({
                data: [{
                  id: 'user-1',
                  username: 'climber',
                  display_name: 'Climber',
                  avatar_url: null,
                  is_public: true,
                }],
                error: null,
              })),
            })),
          })),
        }
      }
      throw new Error(`Unexpected table: ${table}`)
    })
    getUnauthenticatedClient.mockReturnValue({ from })

    const {
      fetchHomepageRecentContributors,
      fetchHomepageRecentCragUpdates,
    } = await import('@/features/home/server/homepage-data')

    const [updates, contributors] = await Promise.all([
      fetchHomepageRecentCragUpdates(),
      fetchHomepageRecentContributors(),
    ])

    expect(from.mock.calls.filter(([table]) => table === 'images')).toHaveLength(1)
    expect(updates).toHaveLength(1)
    expect(contributors).toHaveLength(1)
  })
})
