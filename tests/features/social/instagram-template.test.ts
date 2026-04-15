import { describe, expect, test } from 'vitest'
import { computeInstagramCoverLayout, mapNormalizedPointsToInstagramPost } from '@/features/social/server/instagram-template'

describe('instagram template mapping', () => {
  test('computes centered cover crop for landscape source', () => {
    const layout = computeInstagramCoverLayout(1600, 900)

    expect(layout.drawWidth).toBeCloseTo(2400)
    expect(layout.drawHeight).toBeCloseTo(1350)
    expect(layout.offsetX).toBeCloseTo(-660)
    expect(layout.offsetY).toBeCloseTo(0)
  })

  test('computes centered cover crop for portrait source', () => {
    const layout = computeInstagramCoverLayout(900, 1600)

    expect(layout.drawWidth).toBeCloseTo(1080)
    expect(layout.drawHeight).toBeCloseTo(1920)
    expect(layout.offsetX).toBeCloseTo(0)
    expect(layout.offsetY).toBeCloseTo(-285)
  })

  test('maps normalized points into cropped export coordinates', () => {
    const layout = computeInstagramCoverLayout(1600, 900)
    const mapped = mapNormalizedPointsToInstagramPost([
      { x: 0, y: 0 },
      { x: 0.5, y: 0.5 },
      { x: 1, y: 1 },
    ], layout)

    expect(mapped).toEqual([
      { x: -660, y: 0 },
      { x: 540, y: 675 },
      { x: 1740, y: 1350 },
    ])
  })
})
