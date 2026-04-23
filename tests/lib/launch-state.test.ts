import { beforeEach, describe, expect, test, vi } from 'vitest'
import {
  LAST_ROUTE_TTL_MS,
  buildRelativeHref,
  isGenericLaunchPath,
  isRestorableRoute,
  readLastRoute,
  resolveLaunchTarget,
  writeLastRoute,
} from '@/lib/navigation/launch-state'

describe('launch-state', () => {
  beforeEach(() => {
    vi.stubGlobal('window', {
      location: { origin: 'https://letsboulder.com' },
      navigator: { standalone: false },
      matchMedia: () => ({ matches: false }),
      localStorage: {
        getItem: vi.fn((key: string) => storage.get(key) ?? null),
        setItem: vi.fn((key: string, value: string) => { storage.set(key, value) }),
        removeItem: vi.fn((key: string) => { storage.delete(key) }),
        clear: vi.fn(() => { storage.clear() }),
      },
    })
    window.localStorage.clear()
    vi.useRealTimers()
  })

  const storage = new Map<string, string>()

  test('recognizes restorable routes including logbook', () => {
    expect(isRestorableRoute('/logbook')).toBe(true)
    expect(isRestorableRoute('/gb/font/i/image-1')).toBe(true)
    expect(isRestorableRoute('/gb/font')).toBe(true)
    expect(isRestorableRoute('/offline')).toBe(false)
    expect(isRestorableRoute('/auth')).toBe(false)
  })

  test('stores full relative href including query string', () => {
    writeLastRoute('/gb/font/i/image-1?route=test&climb=abc', 1000)
    expect(readLastRoute(1001)).toEqual({
      href: '/gb/font/i/image-1?route=test&climb=abc',
      savedAt: 1000,
      kind: 'image',
    })
  })

  test('expires stale stored routes after ttl', () => {
    writeLastRoute('/logbook', 1000)
    expect(readLastRoute(1000 + LAST_ROUTE_TTL_MS + 1)).toBeNull()
  })

  test('exact incoming deep links win over stored state', () => {
    writeLastRoute('/logbook', 1000)
    expect(resolveLaunchTarget({
      pathname: '/gb/font/i/image-1',
      search: '?route=test',
      connectivityMode: 'healthy',
      now: 1001,
    })).toBe('/gb/font/i/image-1?route=test')
  })

  test('generic launch restores recent stored route', () => {
    writeLastRoute('/logbook', 1000)
    expect(resolveLaunchTarget({
      pathname: '/launch',
      search: '',
      connectivityMode: 'healthy',
      now: 1000 + LAST_ROUTE_TTL_MS - 1,
    })).toBe('/logbook')
  })

  test('generic offline launch falls back to home when no recent route exists', () => {
    expect(resolveLaunchTarget({
      pathname: '/launch',
      search: '',
      connectivityMode: 'offline',
      now: 1000,
    })).toBe('/')
  })

  test('generic online launch falls back to home when stored route is stale', () => {
    writeLastRoute('/gb/font', 1000)
    expect(resolveLaunchTarget({
      pathname: '/launch',
      search: '',
      connectivityMode: 'healthy',
      now: 1000 + LAST_ROUTE_TTL_MS + 1,
    })).toBe('/')
  })

  test('generic degraded launch falls back to home without recent route', () => {
    expect(resolveLaunchTarget({
      pathname: '/launch',
      search: '',
      connectivityMode: 'degraded',
      now: 1001,
    })).toBe('/')
  })

  test('generic launch path helper includes legacy offline path', () => {
    expect(isGenericLaunchPath('/launch')).toBe(true)
    expect(isGenericLaunchPath('/offline')).toBe(true)
    expect(isGenericLaunchPath('/logbook')).toBe(false)
  })

  test('buildRelativeHref preserves empty search cleanly', () => {
    expect(buildRelativeHref('/logbook', '')).toBe('/logbook')
  })
})
