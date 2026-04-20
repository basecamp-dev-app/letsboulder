const LAST_ROUTE_STORAGE_KEY = 'lb:last-route'

export const LAST_ROUTE_TTL_MS = 72 * 60 * 60 * 1000

interface StoredLastRoute {
  href: string
  savedAt: number
  kind: 'logbook' | 'crag' | 'image'
}

export function isGenericLaunchPath(pathname: string) {
  return pathname === '/launch' || pathname === '/offline'
}

export function getRestorableRouteKind(pathname: string): StoredLastRoute['kind'] | null {
  if (pathname === '/logbook') return 'logbook'
  if (/^\/[a-z]{2}\/[^/]+\/i\/[^/]+$/.test(pathname)) return 'image'
  if (/^\/[a-z]{2}\/[^/]+$/.test(pathname)) return 'crag'
  return null
}

export function isRestorableRoute(pathname: string) {
  return getRestorableRouteKind(pathname) !== null
}

export function buildRelativeHref(pathname: string, search: string) {
  return `${pathname}${search || ''}`
}

export function readLastRoute(now = Date.now()): StoredLastRoute | null {
  if (typeof window === 'undefined') return null

  const raw = window.localStorage.getItem(LAST_ROUTE_STORAGE_KEY)
  if (!raw) return null

  try {
    const parsed = JSON.parse(raw) as Partial<StoredLastRoute>
    if (typeof parsed.href !== 'string' || typeof parsed.savedAt !== 'number' || typeof parsed.kind !== 'string') {
      window.localStorage.removeItem(LAST_ROUTE_STORAGE_KEY)
      return null
    }

    if (now - parsed.savedAt > LAST_ROUTE_TTL_MS) {
      window.localStorage.removeItem(LAST_ROUTE_STORAGE_KEY)
      return null
    }

    return {
      href: parsed.href,
      savedAt: parsed.savedAt,
      kind: parsed.kind as StoredLastRoute['kind'],
    }
  } catch {
    window.localStorage.removeItem(LAST_ROUTE_STORAGE_KEY)
    return null
  }
}

export function writeLastRoute(href: string, savedAt = Date.now()) {
  if (typeof window === 'undefined') return

  const url = new URL(href, window.location.origin)
  const kind = getRestorableRouteKind(url.pathname)
  if (!kind) return

  const payload: StoredLastRoute = {
    href: buildRelativeHref(url.pathname, url.search),
    savedAt,
    kind,
  }

  window.localStorage.setItem(LAST_ROUTE_STORAGE_KEY, JSON.stringify(payload))
}

export function resolveLaunchTarget(args: {
  pathname: string
  search: string
  isOnline: boolean
  now?: number
}) {
  const href = buildRelativeHref(args.pathname, args.search)
  if (!isGenericLaunchPath(args.pathname)) {
    return href
  }

  const stored = readLastRoute(args.now)
  if (stored) {
    return stored.href
  }

  return args.isOnline ? '/' : '/offline/library?reason=offline'
}
