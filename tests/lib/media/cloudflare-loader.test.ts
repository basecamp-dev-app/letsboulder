import { beforeEach, describe, expect, test, vi } from 'vitest'

const { clientEnv } = vi.hoisted(() => ({
  clientEnv: {
    NEXT_PUBLIC_MEDIA_CDN_URL: 'https://static.letsboulder.com',
    NEXT_PUBLIC_SITE_URL: 'https://letsboulder.com',
  },
}))

vi.mock('@/lib/env-client', () => ({ clientEnv }))

describe('cloudflareLoader', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  test('preserves forced app-routed api media urls', async () => {
    const { default: cloudflareLoader } = await import('@/lib/media/cloudflare-loader')

    expect(cloudflareLoader({
      src: '/api/media/private-bucket/images/originals/test/original.jpg?w=480&q=70&lb-media=app',
      width: 640,
      quality: 70,
    })).toBe('/api/media/private-bucket/images/originals/test/original.jpg?w=640&q=70&lb-media=app')
  })

  test('keeps ordinary api media urls on the authenticated app route', async () => {
    const { default: cloudflareLoader } = await import('@/lib/media/cloudflare-loader')

    expect(cloudflareLoader({
      src: '/api/media/private-bucket/images/originals/test/original.jpg?w=480&q=70',
      width: 640,
      quality: 70,
    })).toBe('/api/media/private-bucket/images/originals/test/original.jpg?w=640&q=70')
  })

  test('does not expose api media object keys through the Worker', async () => {
    const { default: cloudflareLoader } = await import('@/lib/media/cloudflare-loader')

    expect(cloudflareLoader({ src: '/api/media/private-bucket/images/test.jpg', width: 241, quality: 70 }))
      .toBe('/api/media/private-bucket/images/test.jpg?w=241')
    expect(cloudflareLoader({ src: '/api/media/private-bucket/images/test.jpg', width: 2560, quality: 70 }))
      .toBe('/api/media/private-bucket/images/test.jpg?w=2560')
  })
})
