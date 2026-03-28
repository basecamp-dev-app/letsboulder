import { describe, expect, test } from 'vitest'
import { getBoundingBoxesForCountry } from '@/lib/geo/bounding-boxes'

describe('country bounds fallback', () => {
  test('returns fallback bounding boxes for countries not in manual overrides', () => {
    const germany = getBoundingBoxesForCountry('DE')
    expect(germany.length).toBeGreaterThan(0)
  })
})
