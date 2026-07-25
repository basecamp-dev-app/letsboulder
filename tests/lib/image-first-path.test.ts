import { describe, expect, test } from 'vitest'
import { buildImageFirstPath } from '@/lib/routes/image-first-path'

describe('buildImageFirstPath', () => {
  test('normalizes country and encodes canonical route parameters', () => {
    expect(buildImageFirstPath({
      countryCode: 'GB',
      cragSlug: 'harrisons-rocks',
      imageId: 'image-1',
      route: 'panda car',
      climbId: 'climb&1',
    })).toBe('/gb/harrisons-rocks/i/image-1?route=panda+car&climb=climb%261')
  })
})
