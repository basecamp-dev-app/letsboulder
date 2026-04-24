import { describe, expect, test } from 'vitest'

import { DEFAULT_PMTILES_URL, getVectorMapConfig } from '@/lib/map/vector-map-config'

describe('vector map config resolver', () => {
  test('uses vector PMTiles while online', () => {
    const config = getVectorMapConfig({ offline: false })

    expect(config.mode).toBe('vector')
    expect(config.pmtilesUrl).toBe(DEFAULT_PMTILES_URL)
    expect(config.attribution).toContain('OpenStreetMap')
  })

  test('uses degraded pins-only mode while offline', () => {
    const config = getVectorMapConfig({ offline: true })

    expect(config.mode).toBe('offline-pins-only')
    expect(config.pmtilesUrl).toBe('')
  })

  test('uses configured PMTiles URL when provided', () => {
    const previousUrl = process.env.NEXT_PUBLIC_PMTILES_URL
    process.env.NEXT_PUBLIC_PMTILES_URL = 'https://static.dev.letsboulder.com/maps/v1/planet.pmtiles'

    expect(getVectorMapConfig().pmtilesUrl).toBe('https://static.dev.letsboulder.com/maps/v1/planet.pmtiles')

    if (previousUrl === undefined) {
      delete process.env.NEXT_PUBLIC_PMTILES_URL
    } else {
      process.env.NEXT_PUBLIC_PMTILES_URL = previousUrl
    }
  })
})
