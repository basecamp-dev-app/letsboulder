import { describe, expect, test } from 'vitest'
import { getMapBaseLayerConfig } from '@/lib/map/base-layer'

describe('map base layer resolver', () => {
  test('uses satellite imagery while online', () => {
    const config = getMapBaseLayerConfig({ offline: false })

    expect(config.mode).toBe('satellite')
    expect(config.imageryUrl).toContain('World_Imagery')
    expect(config.labelsUrl).toContain('World_Boundaries_and_Places')
  })

  test('uses degraded fallback basemap while offline', () => {
    const config = getMapBaseLayerConfig({ offline: true })

    expect(config.mode).toBe('offline-pins-only')
    expect(config.imageryUrl).toBe('')
    expect(config.labelsUrl).toBeNull()
  })
})
