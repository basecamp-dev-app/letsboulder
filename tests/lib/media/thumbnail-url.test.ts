import { describe, expect, test } from 'vitest'
import { buildThumbnailUrl } from '@/lib/media/thumbnail-url'

describe('buildThumbnailUrl', () => {
  test('preserves default behavior for non-api resolved URLs', () => {
    expect(buildThumbnailUrl('/images/originals/test/original.jpg', 480, 70)).toBe(
      '/images/originals/test/original.jpg?variant=detail&format=webp'
    )
  })

  test('adds width and quality to existing api media urls', () => {
    expect(buildThumbnailUrl('/api/media/private-bucket/images/originals/test/original.jpg', 480, 70)).toBe(
      '/api/media/private-bucket/images/originals/test/original.jpg?w=480&q=70'
    )
  })

  test('forces app-routed media urls from private storage references', () => {
    expect(buildThumbnailUrl(
      'https://static.letsboulder.com/images/originals/test/original.jpg?variant=detail&format=webp',
      480,
      70,
      {
        storageUrl: 'private://private-bucket/images/originals/test/original.jpg',
        source: 'api-media',
      }
    )).toBe('/api/media/private-bucket/images/originals/test/original.jpg?w=480&q=70&lb-media=app')
  })

  test('falls back safely when api-media source has no storage-backed url', () => {
    expect(buildThumbnailUrl(
      'https://static.letsboulder.com/images/originals/test/original.jpg?variant=detail&format=webp',
      480,
      70,
      {
        storageUrl: '/images/originals/test/original.jpg',
        source: 'api-media',
      }
    )).toBe('https://static.letsboulder.com/images/originals/test/original.jpg?variant=detail&format=webp')
  })
})
