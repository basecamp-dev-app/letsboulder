import { describe, expect, it } from 'vitest'

import {
  DONATE_NAV_ITEM,
  EXPLORE_NAV_ITEMS,
  LEGAL_NAV_ITEMS,
  PRIMARY_NAV_ITEMS,
  isNavItemActive,
} from '@/lib/nav-items'

describe('canonical navigation destinations', () => {
  it('uses one product label for each primary destination', () => {
    expect(PRIMARY_NAV_ITEMS).toEqual([
      { label: 'Map', href: '/' },
      { label: 'Logbook', href: '/logbook', prefetch: false },
      { label: 'Add topo', href: '/submit', prefetch: false },
    ])
  })

  it('separates support information from the external donation action', () => {
    expect(EXPLORE_NAV_ITEMS).toContainEqual({
      label: 'Support letsboulder',
      href: '/about#support',
    })
    expect(DONATE_NAV_ITEM).toMatchObject({
      label: 'Donate on Ko-fi',
      external: true,
    })
  })

  it('keeps every legal destination available', () => {
    expect(LEGAL_NAV_ITEMS.map((item) => item.href)).toEqual([
      '/privacy',
      '/terms',
      '/cookies',
      '/cookies#privacy-choices',
      '/open-data-terms',
    ])
  })

  it('matches pages and nested product routes without treating anchors as pages', () => {
    expect(isNavItemActive('/logbook/submissions', PRIMARY_NAV_ITEMS[1])).toBe(true)
    expect(isNavItemActive('/about', EXPLORE_NAV_ITEMS[2])).toBe(false)
    expect(isNavItemActive('/', DONATE_NAV_ITEM)).toBe(false)
  })
})
