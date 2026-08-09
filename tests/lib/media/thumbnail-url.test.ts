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

  test('uses the same snapped variant for repeated requests', async () => {
    const { buildThumbnailUrl } = await import('@/lib/media/thumbnail-url')
    const source = '/images/originals/test/original.jpg'

    expect(buildThumbnailUrl(source, 641, 70)).toBe(buildThumbnailUrl(source, 1280, 70))
    expect(buildThumbnailUrl(source, 641, 70)).toContain('variant=detail')
  })
})
