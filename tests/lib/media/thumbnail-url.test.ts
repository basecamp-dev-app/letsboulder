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

  test('keeps api media urls on the authenticated app route', async () => {
    const { buildThumbnailUrl } = await import('@/lib/media/thumbnail-url')

    expect(buildThumbnailUrl('/api/media/private-bucket/images/originals/test/original.jpg', 480, 70)).toBe(
      '/api/media/private-bucket/images/originals/test/original.jpg?w=480'
    )
  })

  test('does not convert private storage locators to public Worker URLs', async () => {
    const { buildThumbnailUrl } = await import('@/lib/media/thumbnail-url')

    expect(buildThumbnailUrl(
      'https://static.letsboulder.com/images/originals/test/original.jpg?variant=detail&format=webp',
      160,
      68,
      {
        storageUrl: 'private://private-bucket/images/originals/test/original.jpg',
        source: 'api-media',
      }
    )).toBe('/api/media/private-bucket/images/originals/test/original.jpg?w=160')
  })

  test('preserves legacy static CDN variant paths for published public images', async () => {
    const { buildThumbnailUrl } = await import('@/lib/media/thumbnail-url')

    expect(buildThumbnailUrl(
      'https://static.letsboulder.com/images/f12c807b-5554-4a9f-b59c-d09068e63ae5/v1/detail.jpg',
      160,
      68
    )).toBe('https://static.letsboulder.com/images/f12c807b-5554-4a9f-b59c-d09068e63ae5/v1/thumb.webp')
  })

  test('preserves legacy static CDN card variant paths for medium thumbnails', async () => {
    const { buildThumbnailUrl } = await import('@/lib/media/thumbnail-url')

    expect(buildThumbnailUrl(
      'https://static.letsboulder.com/images/f12c807b-5554-4a9f-b59c-d09068e63ae5/v1/detail.jpg',
      480,
      70
    )).toBe('https://static.letsboulder.com/images/f12c807b-5554-4a9f-b59c-d09068e63ae5/v1/card.webp')
  })

  test('keeps private media authorization on the app route', async () => {
    const { buildThumbnailUrl } = await import('@/lib/media/thumbnail-url')

    expect(buildThumbnailUrl(
      'https://static.letsboulder.com/images/originals/test/original.jpg?variant=detail&format=webp',
      480,
      70,
      {
        storageUrl: 'private://private-bucket/images/originals/test/original.jpg',
        source: 'api-media',
      }
    )).toBe('/api/media/private-bucket/images/originals/test/original.jpg?w=480')
  })

  test('uses the same snapped variant for repeated requests', async () => {
    const { buildThumbnailUrl } = await import('@/lib/media/thumbnail-url')
    const source = '/images/originals/test/original.jpg'

    expect(buildThumbnailUrl(source, 641, 70)).toBe(buildThumbnailUrl(source, 1280, 70))
    expect(buildThumbnailUrl(source, 641, 70)).toContain('variant=detail')
  })
})
