import { SUPPORT_URL } from '@/lib/site'

export type NavItem = {
  label: string
  href: string
  external?: boolean
  prefetch?: boolean
}

export const PRIMARY_NAV_ITEMS: NavItem[] = [
  { label: 'Map', href: '/' },
  { label: 'Logbook', href: '/logbook', prefetch: false },
  { label: 'Add topo', href: '/submit', prefetch: false },
]

export const EXPLORE_NAV_ITEMS: NavItem[] = [
  { label: 'About', href: '/about' },
  { label: 'Community impact', href: '/impact' },
  { label: 'Support letsboulder', href: '/about#support' },
  { label: 'For gym owners', href: '/gym-owners' },
]

export const LEGAL_NAV_ITEMS: NavItem[] = [
  { label: 'Privacy', href: '/privacy' },
  { label: 'Terms', href: '/terms' },
  { label: 'Cookies', href: '/cookies' },
  { label: 'Privacy choices', href: '/cookies#privacy-choices' },
  { label: 'Open data terms', href: '/open-data-terms' },
]

export const DONATE_NAV_ITEM: NavItem = {
  label: 'Donate on Ko-fi',
  href: SUPPORT_URL,
  external: true,
}

export const ACCOUNT_NAV_ITEMS: NavItem[] = [
  { label: 'Maintain crags', href: '/maintain/crags', prefetch: false },
  { label: 'Settings', href: '/settings', prefetch: false },
]

export const DESKTOP_MORE_MENU_SECTIONS = [
  { label: 'Explore', items: EXPLORE_NAV_ITEMS },
  { label: 'Account', items: ACCOUNT_NAV_ITEMS },
]

export const MOBILE_NAV_SECTIONS = [
  { label: 'Explore', items: EXPLORE_NAV_ITEMS },
  { label: 'Legal', items: LEGAL_NAV_ITEMS },
  { label: 'Account', items: ACCOUNT_NAV_ITEMS },
]

export function isNavItemActive(pathname: string, item: NavItem): boolean {
  if (item.external) return false
  if (item.href.includes('#')) return false

  const path = item.href.split('#')[0]
  if (path === '/') return pathname === '/'
  return pathname === path || pathname.startsWith(`${path}/`)
}

export function isLogbookRoute(pathname: string): boolean {
  return isNavItemActive(pathname, PRIMARY_NAV_ITEMS[1])
}

export function isSubmitRoute(pathname: string): boolean {
  return isNavItemActive(pathname, PRIMARY_NAV_ITEMS[2])
}

export function isNavigationMenuRoute(pathname: string): boolean {
  return [...EXPLORE_NAV_ITEMS, ...LEGAL_NAV_ITEMS, ...ACCOUNT_NAV_ITEMS]
    .some((item) => isNavItemActive(pathname, item))
}
