import { beforeEach, describe, expect, test, vi } from 'vitest'

const { clientEnv } = vi.hoisted(() => ({
  clientEnv: {
    NEXT_PUBLIC_MEDIA_CDN_URL: 'https://static.letsboulder.com',
    NEXT_PUBLIC_SITE_URL: 'https://letsboulder.com',
  },
}))

vi.mock('@/lib/env-client', () => ({ clientEnv }))

describe('buildThumbnailUrl', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  test('returns CDN worker url for originals paths', async () => {
    const { buildThumbnailUrl } = await import('@/lib/media/thumbnail-url')

    expect(buildThumbnailUrl('/images/originals/test/original.jpg', 480, 70)).toBe(
      'https://static.letsboulder.com/images/originals/test/original.jpg?variant=card&format=auto'
    )
  })

  test('rewrites api media urls to CDN worker urls', async () => {
    const { buildThumbnailUrl } = await import('@/lib/media/thumbnail-url')

    expect(buildThumbnailUrl('/api/media/private-bucket/images/originals/test/original.jpg', 480, 70)).toBe(
      'https://static.letsboulder.com/private-bucket/images/originals/test/original.jpg?variant=card&format=auto'
    )
  })

  test('normalizes existing media worker urls to thumbnail variants', async () => {
    const { buildThumbnailUrl } = await import('@/lib/media/thumbnail-url')

    expect(buildThumbnailUrl(
      'https://static.letsboulder.com/images/originals/test/original.jpg?variant=detail&format=webp',
      160,
      68,
      {
        storageUrl: 'private://private-bucket/images/originals/test/original.jpg',
        source: 'api-media',
      }
    )).toBe('https://static.letsboulder.com/images/originals/test/original.jpg?variant=thumb&format=auto')
  })

  test('never emits app-routed media marker for thumbnail surfaces', async () => {
    const { buildThumbnailUrl } = await import('@/lib/media/thumbnail-url')

    expect(buildThumbnailUrl(
      'https://static.letsboulder.com/images/originals/test/original.jpg?variant=detail&format=webp',
      480,
      70,
      {
        storageUrl: 'private://private-bucket/images/originals/test/original.jpg',
        source: 'api-media',
      }
    )).not.toContain('lb-media=app')
  })
})
