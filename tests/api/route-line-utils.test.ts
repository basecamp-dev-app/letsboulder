import { describe, expect, test } from 'vitest'
import { normalizeNewRoutes } from '@/features/submissions/server/submissions/route-line-utils'

const validRoute = {
  name: 'First route',
  grade: '6A',
  points: [{ x: 0.1, y: 0.2 }, { x: 0.3, y: 0.4 }],
  sequenceOrder: 0,
  imageWidth: 1200,
  imageHeight: 800,
}

describe('normalizeNewRoutes', () => {
  test('preserves and normalizes the selected climb type', () => {
    expect(normalizeNewRoutes([{ ...validRoute, climbType: 'deep_water_solo' }]))
      .toEqual([{ ...validRoute, climbType: 'deep-water-solo' }])
  })

  test('rejects invalid per-route climb types', () => {
    expect(normalizeNewRoutes([{ ...validRoute, climbType: 'invalid' }])).toBeNull()
  })
})
