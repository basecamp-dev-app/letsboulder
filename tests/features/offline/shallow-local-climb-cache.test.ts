import { beforeEach, describe, expect, test, vi } from 'vitest'
import { readShallowLocalClimbSnapshot } from '@/features/offline/lib/shallow-local-climb-cache'

const getMock = vi.fn()
const getUserMock = vi.fn()

vi.mock('idb-keyval', () => ({
  get: (...args: Parameters<typeof getMock>) => getMock(...args),
}))

vi.mock('@/lib/supabase', () => ({
  createClient: () => ({
    auth: {
      getUser: (...args: Parameters<typeof getUserMock>) => getUserMock(...args),
    },
  }),
}))

describe('shallow local climb cache', () => {
  beforeEach(() => {
    getMock.mockReset()
    getUserMock.mockReset()
    getUserMock.mockResolvedValue({ data: { user: null } })
  })

  test('reads image-first payload from anon persisted cache', async () => {
    getMock.mockResolvedValue({
      clientState: {
        queries: [
          {
            queryKey: ['image-first', 'image-1'],
            state: {
              data: {
                heroImage: { src: 'https://example.com/hero.jpg' },
                initialRoutes: [
                  {
                    climbId: 'climb-1',
                    climbName: 'Pocket Rocket',
                    climbGrade: '7B',
                  },
                ],
                initialClimbId: 'climb-1',
              },
            },
          },
        ],
      },
    })

    await expect(readShallowLocalClimbSnapshot('image-1', 'climb-1')).resolves.toEqual({
      title: 'Pocket Rocket',
      grade: '7B',
      imageUrl: 'https://example.com/hero.jpg',
    })
  })

  test('falls back to persisted climb status when image-first payload is unavailable', async () => {
    getMock.mockResolvedValue({
      clientState: {
        queries: [
          {
            queryKey: ['climb-status', 'climb-1'],
            state: {
              data: {
                climbed: true,
                want_to_try: false,
              },
            },
          },
        ],
      },
    })

    await expect(readShallowLocalClimbSnapshot('image-1', 'climb-1')).resolves.toEqual({
      title: 'Previously climbed route',
      grade: null,
      imageUrl: null,
    })
  })
})
