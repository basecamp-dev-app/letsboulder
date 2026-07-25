import { describe, expect, it } from 'vitest'

import { getSafeRedirect } from '@/lib/safe-redirect'

describe('getSafeRedirect', () => {
  it('preserves local paths, queries, and hashes', () => {
    expect(getSafeRedirect('/gg/crag/i/image?route=route-1#details')).toBe('/gg/crag/i/image?route=route-1#details')
    expect(getSafeRedirect('/submit?cragId=crag-1')).toBe('/submit?cragId=crag-1')
  })

  it.each([
    null,
    '',
    'https://example.com/path',
    '//example.com/path',
    '/\\example.com/path',
  ])('uses the fallback for unsafe value %s', (value) => {
    expect(getSafeRedirect(value, '/fallback')).toBe('/fallback')
  })
})
