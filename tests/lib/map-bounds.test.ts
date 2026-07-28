import { describe, expect, it } from 'vitest'

import { normalizePaddedViewport } from '@/lib/map/map-bounds'
import { mapPinsQueryKey } from '@/lib/map/map-pins-query'

describe('viewport map bounds', () => {
  it('pads bounds by 25 percent and floors zoom for the query key', () => {
    const viewport = normalizePaddedViewport({ west: 10, south: 20, east: 30, north: 40 }, 8.9)

    expect(viewport).toEqual({ bounds: { west: 5, south: 15, east: 35, north: 45 }, zoom: 8 })
    expect(mapPinsQueryKey(viewport)).toEqual(['map-pins', 8, 5, 15, 35, 45])
  })

  it('normalizes padded bounds across the antimeridian', () => {
    expect(normalizePaddedViewport({ west: 170, south: -10, east: -170, north: 10 }, 4)).toEqual({
      bounds: { west: 165, south: -15, east: -165, north: 15 },
      zoom: 4,
    })
  })

  it('uses canonical world longitude bounds for very wide viewports', () => {
    expect(normalizePaddedViewport({ west: -180, south: -85, east: 180, north: 85 }, 2).bounds).toEqual({
      west: -180,
      south: -85.05113,
      east: 180,
      north: 85.05113,
    })
  })

  it('keeps polar bounds ordered within Web Mercator limits', () => {
    const north = normalizePaddedViewport({ west: 0, south: 86, east: 1, north: 87 }, 10)
    const south = normalizePaddedViewport({ west: 0, south: -87, east: 1, north: -86 }, 10)

    expect(north.bounds.north).toBeGreaterThan(north.bounds.south)
    expect(north.bounds.north).toBeLessThanOrEqual(85.05113)
    expect(south.bounds.north).toBeGreaterThan(south.bounds.south)
    expect(south.bounds.south).toBeGreaterThanOrEqual(-85.05113)
  })
})
