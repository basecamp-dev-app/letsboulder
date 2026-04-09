import { describe, expect, test } from 'vitest'
import { normalizePoints } from '@/lib/canvasMath'

describe('normalizePoints', () => {
  test('converts pixel points into normalized canvas coordinates', () => {
    const points = normalizePoints(
      [
        { x: 100, y: 50 },
        { x: 500, y: 250 },
      ],
      { width: 1000, height: 500, naturalWidth: 1000, naturalHeight: 500 }
    )

    expect(points).toEqual([
      { x: 0.1, y: 0.1 },
      { x: 0.5, y: 0.5 },
    ])
  })
})
