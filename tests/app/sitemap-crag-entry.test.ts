import { describe, expect, it } from 'vitest'

import { buildSitemapCragEntry } from '@/app/sitemaps/crags/[page]/route'

describe('crag sitemap entries', () => {
  it('builds the canonical public URL for an eligible record', () => {
    expect(buildSitemapCragEntry({
      slug: 'stanage-popular',
      country_code: 'GB',
      updated_at: '2026-08-28T12:00:00.000Z',
    })).toEqual({
      url: 'https://letsboulder.com/gb/stanage-popular',
      lastModified: new Date('2026-08-28T12:00:00.000Z'),
    })
  })

  it('rejects rows without a complete canonical identity', () => {
    expect(buildSitemapCragEntry({ slug: null, country_code: 'GB', updated_at: null })).toBeNull()
    expect(buildSitemapCragEntry({ slug: 'crag', country_code: null, updated_at: null })).toBeNull()
  })
})
