import { describe, expect, test } from 'vitest'
import {
  buildSitemapClimbEntry,
  type SitemapClimbRow,
} from '@/app/sitemaps/climbs/[page]/route'
import { renderUrlSet, SITEMAP_PAGE_SIZE } from '@/lib/sitemap/xml'

function createClimb(overrides: Partial<SitemapClimbRow> = {}): SitemapClimbRow {
  return {
    id: 'climb-1',
    shared_climb_id: null,
    slug: 'route & one',
    updated_at: '2026-07-25T12:00:00.000Z',
    crags: { slug: 'test-crag', country_code: 'GB' },
    route_lines: [
      {
        id: 'line-newer',
        image_id: 'image-newer',
        images: {
          id: 'image-newer',
          url: 'https://static.letsboulder.com/newer.jpg',
          is_verified: false,
          verification_count: 10,
          created_at: '2026-07-25T12:00:00.000Z',
        },
      },
      {
        id: 'line-verified',
        image_id: 'image-verified',
        images: {
          id: 'image-verified',
          url: 'https://static.letsboulder.com/verified.jpg',
          is_verified: true,
          verification_count: 1,
          created_at: '2026-01-01T00:00:00.000Z',
        },
      },
    ],
    ...overrides,
  }
}

describe('climb sitemap entries', () => {
  test('uses the best image and normalized canonical path', () => {
    const entry = buildSitemapClimbEntry(createClimb({ shared_climb_id: 'shared-climb' }))

    expect(entry?.url).toBe(
      'https://letsboulder.com/gb/test-crag/i/image-verified?route=route+%26+one&climb=shared-climb'
    )
    expect(SITEMAP_PAGE_SIZE).toBe(1_000)
  })

  test('excludes climbs without an image-backed route line', () => {
    expect(buildSitemapClimbEntry(createClimb({ route_lines: [] }))).toBeNull()
  })

  test('escapes canonical query parameters in XML', () => {
    const entry = buildSitemapClimbEntry(createClimb())
    expect(entry).not.toBeNull()

    const xml = renderUrlSet([entry!])
    expect(xml).toContain('route=route+%26+one&amp;climb=climb-1')
  })
})
