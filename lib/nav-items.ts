export type NavItem = {
  label: string
  href: string
}

export const PRIMARY_NAV_ITEMS: NavItem[] = [
  { label: 'Logbook', href: '/logbook' },
  { label: 'Map', href: '/' },
  { label: 'Upload', href: '/submit' },
]

export const EXPLORE_NAV_ITEMS: NavItem[] = [
  { label: 'Impact', href: '/impact' },
  { label: 'About', href: '/about' },
  { label: 'Support', href: '/about#support' },
]

export const TRACK_NAV_ITEMS: NavItem[] = [
  { label: 'Logbook', href: '/logbook' },
  { label: 'Upload', href: '/submit' },
]

export const ACCOUNT_NAV_ITEMS: NavItem[] = [
  { label: 'Settings', href: '/settings' },
]

export const DESKTOP_MORE_MENU_SECTIONS = [
  { label: 'Explore', items: EXPLORE_NAV_ITEMS },
  { label: 'Track', items: TRACK_NAV_ITEMS },
  { label: 'Account', items: ACCOUNT_NAV_ITEMS },
]

export const MOBILE_NAV_SECTIONS = DESKTOP_MORE_MENU_SECTIONS

export function isLogbookRoute(pathname: string): boolean {
  return pathname === '/logbook' || pathname.startsWith('/logbook/')
}

export function isSubmitRoute(pathname: string): boolean {
  return pathname === '/submit' || pathname.startsWith('/submit/')
}

export function isNavigationMenuRoute(pathname: string): boolean {
  return EXPLORE_NAV_ITEMS.some((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
    || TRACK_NAV_ITEMS.some((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
    || ACCOUNT_NAV_ITEMS.some((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
}
