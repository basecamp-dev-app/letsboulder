import { beforeEach, describe, expect, test, vi } from 'vitest'

const fetchMock = vi.fn()

vi.stubGlobal('fetch', fetchMock)
vi.stubGlobal('self', globalThis)
vi.stubGlobal('HOME_URL', '/')
vi.stubGlobal('OFFLINE_LAUNCH_URL', '/offline')
vi.stubGlobal('OFFLINE_LIBRARY_URL', '/offline/library')
vi.stubGlobal('MANIFEST_URL', '/manifest.json')
vi.stubGlobal('BUILD_MANIFEST_URL', '/_next/build-manifest.json')
vi.stubGlobal('ROUTE_ASSET_CACHE', 'offline-route-assets-v2')
vi.stubGlobal('SHELL_CACHE', 'offline-shell-v3')

const BASE_ORIGIN = 'https://letsboulder.com'

class ServiceWorkerRequest extends Request {
  constructor(input: string | URL | Request, init?: RequestInit) {
    const normalizedInput = typeof input === 'string' && input.startsWith('/') ? new URL(input, BASE_ORIGIN).toString() : input
    super(normalizedInput, init)
  }
}

vi.stubGlobal('Request', ServiceWorkerRequest)

beforeEach(() => {
  fetchMock.mockReset()
  vi.resetModules()
})

async function loadSwCacheUtils() {
  await import('../../public/sw-cache-utils.js')
}

describe('sw-cache-utils', () => {
  test('cacheRequiredPageAssets throws when a required page cannot be fetched', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 200 }))
      .mockResolvedValueOnce(new Response('', { status: 503 }))

    await loadSwCacheUtils()

    await expect(globalThis.cacheRequiredPageAssets(['/gb/crag-one/i/image-1?climb=climb-1'])).rejects.toThrow(
      'Failed to fetch offline page /gb/crag-one/i/image-1?climb=climb-1'
    )
  })

  test('cacheRequiredPageAssets caches discovered route assets', async () => {
    const cachePut = vi.fn()
    const cacheMatch = vi.fn().mockResolvedValue(undefined)
    const open = vi.fn(async () => ({ match: cacheMatch, put: cachePut }))
    vi.stubGlobal('caches', { open })

    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 200 }))
      .mockResolvedValueOnce(new Response('<script src="/_next/static/chunks/route.js"></script><link href="/_next/static/css/app.css" rel="stylesheet" />', { status: 200 }))
      .mockResolvedValueOnce(new Response('js', { status: 200 }))
      .mockResolvedValueOnce(new Response('css', { status: 200 }))

    await loadSwCacheUtils()

    await globalThis.cacheRequiredPageAssets(['/offline'])

    expect(fetchMock).toHaveBeenCalledTimes(5)
    expect(fetchMock.mock.calls[3]?.[0]).toBeInstanceOf(Request)
    expect(fetchMock.mock.calls[4]?.[0]).toBeInstanceOf(Request)
  })

  test('collectShellAssetRequests includes theme-init and preloaded font assets', async () => {
    fetchMock.mockResolvedValue(new Response(`
      <script src="/theme-init.js"></script>
      <link rel="preload" href="/_next/static/media/font.woff2" as="font" type="font/woff2" crossorigin>
      <script src="/_next/static/chunks/app.js"></script>
    `, { status: 200 }))

    await loadSwCacheUtils()

    const requests = await globalThis.collectShellAssetRequests()
    const urls = requests.map((request: Request) => new URL(request.url).pathname)

    expect(urls).toContain('/theme-init.js')
    expect(urls).toContain('/_next/static/media/font.woff2')
    expect(urls).toContain('/_next/static/chunks/app.js')
  })

  test('collectAssetRequestsFromPage uses the shared asset extractor', async () => {
    fetchMock.mockResolvedValue(new Response(`
      <script src="/theme-init.js"></script>
      <link rel="preload" href="/_next/static/media/font.woff2" as="font" type="font/woff2" crossorigin>
    `, { status: 200 }))

    await loadSwCacheUtils()

    const requests = await globalThis.collectAssetRequestsFromPage('/ch/murgtal-2')
    const urls = requests.map((request: Request) => new URL(request.url).pathname)

    expect(urls).toContain('/theme-init.js')
    expect(urls).toContain('/_next/static/media/font.woff2')
  })

  test('cacheRequiredPageAssets includes build manifest chunks', async () => {
    const cachePut = vi.fn()
    const cacheMatch = vi.fn().mockResolvedValue(undefined)
    const open = vi.fn(async () => ({ match: cacheMatch, put: cachePut }))
    vi.stubGlobal('caches', { open })

    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({
        rootMainFiles: ['/_next/static/chunks/root.js'],
        pages: {
          '/': ['/_next/static/chunks/home.js'],
          '/[country]/[crag]': ['/_next/static/chunks/crag.js'],
        },
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        '711639': {
          id: 711639,
          files: ['static/chunks/0sc48yaw32xc7.js'],
        },
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response('<script src="/_next/static/chunks/page.js"></script>', { status: 200 }))
      .mockResolvedValueOnce(new Response('page', { status: 200 }))
      .mockResolvedValueOnce(new Response('root', { status: 200 }))
      .mockResolvedValueOnce(new Response('crag', { status: 200 }))
      .mockResolvedValueOnce(new Response('react-loadable', { status: 200 }))
      .mockResolvedValueOnce(new Response('react loadable chunk', { status: 200 }))

    await loadSwCacheUtils()

    await globalThis.cacheRequiredPageAssets(['/ch/murgtal-2'])

    const requestedPaths = fetchMock.mock.calls
      .map((call) => call[0])
      .filter((value) => value instanceof Request)
      .map((request: Request) => new URL(request.url).pathname)

    expect(requestedPaths).toContain('/_next/build-manifest.json')
    expect(requestedPaths).toContain('/_next/static/chunks/root.js')
    expect(requestedPaths).toContain('/_next/static/chunks/crag.js')
  })

  test('cacheRequiredPageAssets includes route-scoped react loadable chunks for crag pages', async () => {
    const cachePut = vi.fn()
    const cacheMatch = vi.fn().mockResolvedValue(undefined)
    const open = vi.fn(async () => ({ match: cacheMatch, put: cachePut }))
    vi.stubGlobal('caches', { open })

    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({
        rootMainFiles: ['/_next/static/chunks/root.js'],
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        '711639': {
          id: 711639,
          files: ['static/chunks/0sc48yaw32xc7.js'],
        },
        '294970': {
          id: 294970,
          files: ['static/chunks/0_f2g792_ss-..js', 'static/chunks/0tzldtdj3h2m3.js'],
        },
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response('<script src="/_next/static/chunks/page.js"></script>', { status: 200 }))
      .mockResolvedValueOnce(new Response('page', { status: 200 }))
      .mockResolvedValueOnce(new Response('root', { status: 200 }))
      .mockResolvedValueOnce(new Response('crag chunk 1', { status: 200 }))
      .mockResolvedValueOnce(new Response('crag chunk 2', { status: 200 }))
      .mockResolvedValueOnce(new Response('crag chunk 3', { status: 200 }))

    await loadSwCacheUtils()

    await globalThis.cacheRequiredPageAssets(['/ch/murgtal-2'])

    const requestedPaths = fetchMock.mock.calls
      .map((call) => call[0])
      .filter((value) => value instanceof Request)
      .map((request: Request) => new URL(request.url).pathname)

    expect(requestedPaths).toContain('/_next/server/app/[country]/[crag]/page/react-loadable-manifest.json')
    expect(requestedPaths).toContain('/_next/static/chunks/0sc48yaw32xc7.js')
    expect(requestedPaths).toContain('/_next/static/chunks/0_f2g792_ss-..js')
    expect(requestedPaths).toContain('/_next/static/chunks/0tzldtdj3h2m3.js')
  })
})
