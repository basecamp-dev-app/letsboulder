import { describe, expect, test } from 'vitest'

import { DEFAULT_MAP_STYLE_URL, getVectorMapConfig } from '@/lib/map/vector-map-config'

describe('vector map config resolver', () => {
  test('uses OpenFreeMap while online', () => {
    const config = getVectorMapConfig({ offline: false })

    expect(config.mode).toBe('hosted-style')
    expect(config.styleUrl).toBe(DEFAULT_MAP_STYLE_URL)
    expect(config.attribution).toContain('OpenFreeMap')
  })

  test('uses degraded pins-only mode while offline', () => {
    const config = getVectorMapConfig({ offline: true })

    expect(config.mode).toBe('offline-pins-only')
    expect(config.styleUrl).toBe('')
  })

  test('uses configured map style URL when provided', () => {
    const previousUrl = process.env.NEXT_PUBLIC_MAP_STYLE_URL
    process.env.NEXT_PUBLIC_MAP_STYLE_URL = 'https://tiles.example.com/styles/outdoor'

    expect(getVectorMapConfig().styleUrl).toBe('https://tiles.example.com/styles/outdoor')

    if (previousUrl === undefined) {
      delete process.env.NEXT_PUBLIC_MAP_STYLE_URL
    } else {
      process.env.NEXT_PUBLIC_MAP_STYLE_URL = previousUrl
    }
  })
})
