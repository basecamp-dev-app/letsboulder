import { describe, expect, test, vi } from 'vitest'

const { clientEnv } = vi.hoisted(() => ({
  clientEnv: { NEXT_PUBLIC_MEDIA_CDN_URL: 'https://static.letsboulder.com' },
}))

vi.mock('@/lib/env-client', () => ({ clientEnv }))

describe('resolveRouteImageUrl', () => {
  test('keeps private locators on the authenticated media route', async () => {
    const { resolveRouteImageUrl } = await import('@/lib/media/route-image-url')

    expect(resolveRouteImageUrl('private://private-bucket/images/originals/photo.jpg')).toBe(
      '/api/media/private-bucket/images/originals/photo.jpg'
    )
  })

  test('uses the Worker host for public static image paths', async () => {
    const { resolveRouteImageUrl } = await import('@/lib/media/route-image-url')

    expect(resolveRouteImageUrl('/images/image-id/v1/detail.jpg')).toBe(
      'https://static.letsboulder.com/images/image-id/v1/detail.jpg'
    )
  })
})
