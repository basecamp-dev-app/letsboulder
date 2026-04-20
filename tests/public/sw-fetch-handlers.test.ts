import { beforeEach, describe, expect, test, vi } from 'vitest'

const fetchMock = vi.fn()

vi.stubGlobal('fetch', fetchMock)
vi.stubGlobal('BUILD_ASSET_CACHE_PREFIX', 'offline-build-assets')
vi.stubGlobal('ROUTE_ASSET_CACHE', 'offline-route-assets-v2')
vi.stubGlobal('HOME_URL', '/')
vi.stubGlobal('OFFLINE_LAUNCH_URL', '/offline')
vi.stubGlobal('OFFLINE_LIBRARY_URL', '/offline/library')
vi.stubGlobal('toSameOriginRequest', (url: string) => new Request(url.startsWith('/') ? `https://letsboulder.com${url}` : url))
vi.stubGlobal('getBuildAssetCacheName', vi.fn(async () => 'offline-build-assets-current'))
vi.stubGlobal('matchShellRequest', vi.fn())
vi.stubGlobal('matchRouteAssetRequest', vi.fn())

const buildAssetCacheMatch = vi.fn()
const buildAssetCachePut = vi.fn()
const routeAssetCacheMatch = vi.fn()
const routeAssetCachePut = vi.fn()

vi.stubGlobal('caches', {
  open: vi.fn(async (cacheName: string) => {
    if (cacheName === 'offline-build-assets-current') {
      return { match: buildAssetCacheMatch, put: buildAssetCachePut }
    }

    if (cacheName === 'offline-route-assets-v2') {
      return { match: routeAssetCacheMatch, put: routeAssetCachePut }
    }

    return { match: vi.fn(), put: vi.fn() }
  }),
})

class ServiceWorkerRequest extends Request {
  constructor(input: string | URL | Request, init?: RequestInit) {
    const normalizedInput = typeof input === 'string' && input.startsWith('/') ? new URL(input, 'https://letsboulder.com').toString() : input
    super(normalizedInput, init)
  }
}

vi.stubGlobal('Request', ServiceWorkerRequest)
vi.stubGlobal('Response', Response)

beforeEach(() => {
  fetchMock.mockReset()
  buildAssetCacheMatch.mockReset()
  buildAssetCachePut.mockReset()
  routeAssetCacheMatch.mockReset()
  routeAssetCachePut.mockReset()
  vi.resetModules()
})

describe('sw-fetch-handlers', () => {
  test('handleShellFetch serves cached shell response before network refresh', async () => {
    const cachedResponse = new Response('cached shell', { status: 200 })
    vi.mocked(matchShellRequest).mockResolvedValue(cachedResponse)
    fetchMock.mockResolvedValue(new Response('fresh shell', { status: 200 }))

    await import('../../public/sw-fetch-handlers.js')

    const response = await globalThis.handleShellFetch(new Request('https://letsboulder.com/logbook'))

    expect(response).toBe(cachedResponse)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  test('handleRouteAssetFetch serves next static assets from shared build cache before network', async () => {
    const cachedResponse = new Response('cached build asset', { status: 200 })
    vi.mocked(matchRouteAssetRequest).mockResolvedValue(cachedResponse)

    await import('../../public/sw-fetch-handlers.js')

    const response = await globalThis.handleRouteAssetFetch(new Request('https://letsboulder.com/_next/static/chunks/app.js'))

    expect(response).toBe(cachedResponse)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test('handleRouteAssetFetch writes fetched next static assets into shared build cache', async () => {
    vi.mocked(matchRouteAssetRequest).mockResolvedValue(undefined)
    fetchMock.mockResolvedValue(new Response('network build asset', { status: 200 }))

    await import('../../public/sw-fetch-handlers.js')

    await globalThis.handleRouteAssetFetch(new Request('https://letsboulder.com/_next/static/chunks/app.js'))

    expect(buildAssetCachePut).toHaveBeenCalledTimes(1)
    expect(routeAssetCachePut).not.toHaveBeenCalled()
  })
})
