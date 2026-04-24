import { beforeEach, describe, expect, test, vi } from 'vitest'

const fetchMock = vi.fn()

vi.stubGlobal('fetch', fetchMock)
vi.stubGlobal('ROUTE_ASSET_CACHE', 'offline-route-assets-v2')
vi.stubGlobal('HOME_URL', '/')
vi.stubGlobal('OFFLINE_URL', '/offline')
vi.stubGlobal('OFFLINE_LAUNCH_URL', '/offline')
vi.stubGlobal('OFFLINE_LIBRARY_URL', '/offline/library')
vi.stubGlobal('toSameOriginRequest', (url: string) => new Request(url.startsWith('/') ? `https://letsboulder.com${url}` : url))
vi.stubGlobal('getBuildAssetCacheName', vi.fn(async () => 'offline-build-assets-current'))
vi.stubGlobal('matchShellRequest', vi.fn())
vi.stubGlobal('matchRouteAssetRequest', vi.fn())

const routeAssetCacheMatch = vi.fn()
const routeAssetCachePut = vi.fn()

vi.stubGlobal('caches', {
  open: vi.fn(async (cacheName: string) => {
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
  routeAssetCacheMatch.mockReset()
  routeAssetCachePut.mockReset()
  vi.resetModules()
})

function createNavigateRequest(url: string): Request {
  const request = new Request(url)
  Object.defineProperty(request, 'mode', {
    configurable: true,
    value: 'navigate',
  })
  return request
}

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

  test('handleShellFetch serves a cached climb navigation when offline', async () => {
    const cachedResponse = new Response('cached climb', { status: 200 })
    vi.mocked(matchShellRequest).mockImplementation(async (request: Request) => {
      const pathname = new URL(request.url).pathname
      return pathname === '/usa/joe/barefoot-on-sacrifice' ? cachedResponse : undefined
    })
    fetchMock.mockRejectedValue(new Error('offline'))

    await import('../../public/sw-fetch-handlers.js')

    const response = await globalThis.handleShellFetch(createNavigateRequest('https://letsboulder.com/usa/joe/barefoot-on-sacrifice'))

    expect(response).toBe(cachedResponse)
  })

  test('handleShellFetch serves a cached crag navigation when offline', async () => {
    const cachedResponse = new Response('cached crag', { status: 200 })
    vi.mocked(matchShellRequest).mockImplementation(async (request: Request) => {
      const pathname = new URL(request.url).pathname
      return pathname === '/usa/joe' ? cachedResponse : undefined
    })
    fetchMock.mockRejectedValue(new Error('offline'))

    await import('../../public/sw-fetch-handlers.js')

    const response = await globalThis.handleShellFetch(createNavigateRequest('https://letsboulder.com/usa/joe'))

    expect(response).toBe(cachedResponse)
  })

  test('handleShellFetch serves a cached logbook navigation when offline', async () => {
    const cachedResponse = new Response('cached logbook', { status: 200 })
    vi.mocked(matchShellRequest).mockImplementation(async (request: Request) => {
      const pathname = new URL(request.url).pathname
      return pathname === '/logbook' ? cachedResponse : undefined
    })
    fetchMock.mockRejectedValue(new Error('offline'))

    await import('../../public/sw-fetch-handlers.js')

    const response = await globalThis.handleShellFetch(createNavigateRequest('https://letsboulder.com/logbook'))

    expect(response).toBe(cachedResponse)
  })

  test('handleShellFetch serves the offline page when an offline navigation is uncached', async () => {
    const offlineResponse = new Response('offline page', { status: 200 })
    vi.mocked(matchShellRequest).mockImplementation(async (request: Request) => {
      const pathname = new URL(request.url).pathname
      return pathname === '/offline' ? offlineResponse : undefined
    })
    fetchMock.mockRejectedValue(new Error('offline'))

    await import('../../public/sw-fetch-handlers.js')

    const response = await globalThis.handleShellFetch(createNavigateRequest('https://letsboulder.com/usa/joe/missing-problem'))

    expect(response).toBe(offlineResponse)
  })

  test('handleShellFetch serves the offline page when home is uncached offline', async () => {
    const offlineResponse = new Response('offline page', { status: 200 })
    vi.mocked(matchShellRequest).mockImplementation(async (request: Request) => {
      const pathname = new URL(request.url).pathname
      return pathname === '/offline' ? offlineResponse : undefined
    })
    fetchMock.mockRejectedValue(new Error('offline'))

    await import('../../public/sw-fetch-handlers.js')

    const response = await globalThis.handleShellFetch(createNavigateRequest('https://letsboulder.com/'))

    expect(response).toBe(offlineResponse)
  })

  test('handleShellFetch returns html fallback when offline page is uncached', async () => {
    vi.mocked(matchShellRequest).mockResolvedValue(undefined)
    fetchMock.mockRejectedValue(new Error('offline'))

    await import('../../public/sw-fetch-handlers.js')

    const response = await globalThis.handleShellFetch(createNavigateRequest('https://letsboulder.com/usa/joe/missing-problem'))

    expect(response.status).toBe(503)
    expect(response.headers.get('Content-Type')).toBe('text/html; charset=utf-8')
  })

  test('handleRouteAssetFetch serves shell assets from cache before network', async () => {
    const cachedResponse = new Response('cached build asset', { status: 200 })
    vi.mocked(matchRouteAssetRequest).mockResolvedValue(cachedResponse)

    await import('../../public/sw-fetch-handlers.js')

    const response = await globalThis.handleRouteAssetFetch(new Request('https://letsboulder.com/theme-init.js'))

    expect(response).toBe(cachedResponse)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test('handleRouteAssetFetch writes fetched next static assets into the route asset cache', async () => {
    vi.mocked(matchRouteAssetRequest).mockResolvedValue(undefined)
    fetchMock.mockResolvedValue(new Response('network build asset', { status: 200 }))

    await import('../../public/sw-fetch-handlers.js')

    await globalThis.handleRouteAssetFetch(new Request('https://letsboulder.com/_next/static/chunks/app.js'))

    expect(routeAssetCachePut).toHaveBeenCalledTimes(1)
  })

  test('handleRouteAssetFetch writes fetched shell assets into the route asset cache', async () => {
    vi.mocked(matchRouteAssetRequest).mockResolvedValue(undefined)
    fetchMock.mockResolvedValue(new Response('network shell asset', { status: 200 }))

    await import('../../public/sw-fetch-handlers.js')

    await globalThis.handleRouteAssetFetch(new Request('https://letsboulder.com/theme-init.js'))

    expect(routeAssetCachePut).toHaveBeenCalledTimes(1)
  })
})
