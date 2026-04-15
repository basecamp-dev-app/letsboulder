import { describe, expect, test } from 'vitest'
import { computeInstagramCoverLayout } from '@/features/social/server/instagram-template'

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
})
