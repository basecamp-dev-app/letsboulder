export type NavItem = {
  label: string
  href: string
}

export const PRIMARY_NAV_ITEMS: NavItem[] = [
  { label: 'Logbook', href: '/logbook' },
  { label: 'Map', href: '/' },
  { label: 'Upload', href: '/submit' },
]

export const SECONDARY_NAV_ITEMS: NavItem[] = [
  { label: 'Gear', href: '/gear' },
  { label: 'Impact', href: '/impact' },
  { label: 'About', href: '/about' },
  { label: 'Support', href: '/about#support' },
]

export const ACCOUNT_NAV_ITEMS: NavItem[] = [
  { label: 'Settings', href: '/settings' },
]

export const DESKTOP_MORE_MENU_ITEMS = [...ACCOUNT_NAV_ITEMS, ...SECONDARY_NAV_ITEMS]

export const MOBILE_ACCOUNT_MENU_ITEMS = [...ACCOUNT_NAV_ITEMS, ...SECONDARY_NAV_ITEMS]

export function isLogbookRoute(pathname: string): boolean {
  return pathname === '/logbook' || pathname.startsWith('/logbook/')
}

export function isSubmitRoute(pathname: string): boolean {
  return pathname === '/submit' || pathname.startsWith('/submit/')
}

export function isAccountMenuRoute(pathname: string): boolean {
  return ACCOUNT_NAV_ITEMS.some((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
    || SECONDARY_NAV_ITEMS.some((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
}
