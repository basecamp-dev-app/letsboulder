import { beforeEach, describe, expect, it, vi } from 'vitest'

type WorkerHandler = (event: { waitUntil(promise: Promise<unknown>): void; request?: Request; respondWith?(promise: Promise<Response>): void; data?: unknown }) => void

const handlers = new Map<string, WorkerHandler>()
const shellEntries = new Map<string, Response>()
const staticEntries = new Map<string, Response>()
const mediaEntries = new Map<string, Response>()
const deleteCache = vi.fn(async () => true)
const claim = vi.fn(async () => undefined)
const skipWaiting = vi.fn(async () => undefined)
const fetchMock = vi.fn()
const staticCacheName = 'letsboulder-next-static-test-release'

function cacheFor(entries: Map<string, Response>) {
  return {
    match: vi.fn(async (request: Request | string) => entries.get(typeof request === 'string' ? request : request.url)),
    put: vi.fn(async (request: Request | string, response: Response) => {
      entries.set(typeof request === 'string' ? request : request.url, response)
    }),
  }
}

const shellCache = cacheFor(shellEntries)
const staticCache = cacheFor(staticEntries)
const mediaCache = cacheFor(mediaEntries)

vi.stubGlobal('self', {
  location: { origin: 'https://letsboulder.com' },
  clients: { claim },
  skipWaiting,
  addEventListener: vi.fn((type: string, handler: WorkerHandler) => handlers.set(type, handler)),
})
vi.stubGlobal('caches', {
  open: vi.fn(async (name: string) => name === 'letsboulder-offline-shell-v4' ? shellCache : name === 'letsboulder-offline-immutable-v1' ? mediaCache : staticCache),
  keys: vi.fn(async () => ['offline-shell-v4', 'runtime-transient-v2', 'letsboulder-offline-shell-v3', staticCacheName, 'letsboulder-next-static-old-release', 'unrelated-cache']),
  delete: deleteCache,
  match: vi.fn(async (request: Request) => staticEntries.get(request.url) || shellEntries.get(request.url)),
})
vi.stubGlobal('fetch', fetchMock)

async function dispatch(type: string, event: Partial<Parameters<WorkerHandler>[0]> = {}) {
  let pending: Promise<unknown> = Promise.resolve()
  let response: Promise<Response> | undefined
  handlers.get(type)?.({
    waitUntil: (promise) => { pending = promise },
    respondWith: (promise) => { response = promise },
    ...event,
  })
  await pending
  return response
}

describe('active service worker', () => {
  beforeEach(async () => {
    handlers.clear()
    shellEntries.clear()
    staticEntries.clear()
    mediaEntries.clear()
    vi.clearAllMocks()
    fetchMock.mockImplementation(async (input: string | Request | URL) => {
      const url = typeof input === 'string' ? input : input instanceof Request ? input.url : input.toString()
      if (url === '/sw-build-assets.json') return new Response(JSON.stringify({ version: 'test-release' }))
      if (url.startsWith('/offline')) return new Response('<script src="/_next/static/chunks/offline.js"></script>')
      return new Response('asset')
    })
    vi.resetModules()
    await import('../../public/sw.js')
  })

  it('pre-caches every standalone offline shell and its static assets', async () => {
    await dispatch('install')

    expect(fetchMock).toHaveBeenCalledWith('/offline')
    expect(fetchMock).toHaveBeenCalledWith('/offline/library')
    expect(fetchMock).toHaveBeenCalledWith('/offline/crag')
    expect(fetchMock).toHaveBeenCalledWith('/_next/static/chunks/offline.js')
    expect(shellCache.put).toHaveBeenCalledTimes(4)
    expect(shellCache.put).toHaveBeenCalledWith('/sw-build-assets.json', expect.any(Response))
  })

  it('does not install when a required shell cannot be cached', async () => {
    fetchMock.mockImplementation(async (input: string | Request | URL) => {
      const url = typeof input === 'string' ? input : input instanceof Request ? input.url : input.toString()
      if (url === '/sw-build-assets.json') return new Response(JSON.stringify({ version: 'test-release' }))
      return url === '/offline/library' ? new Response('unavailable', { status: 503 }) : new Response('ok')
    })

    await expect(dispatch('install')).rejects.toThrow('Unable to cache offline shell')
  })

  it('deletes retired and previous static caches while preserving the current static cache', async () => {
    await dispatch('activate')

    expect(deleteCache).toHaveBeenCalledWith('offline-shell-v4')
    expect(deleteCache).toHaveBeenCalledWith('runtime-transient-v2')
    expect(deleteCache).toHaveBeenCalledWith('letsboulder-offline-shell-v3')
    expect(deleteCache).toHaveBeenCalledWith('letsboulder-next-static-old-release')
    expect(deleteCache).not.toHaveBeenCalledWith(staticCacheName)
    expect(deleteCache).not.toHaveBeenCalledWith('unrelated-cache')
    expect(claim).toHaveBeenCalledOnce()
  })

  it('supports explicit activation with SKIP_WAITING', async () => {
    await dispatch('message', { data: { type: 'SKIP_WAITING' } })
    expect(skipWaiting).toHaveBeenCalledOnce()
  })

  it('does not handle the retired destructive auth-cache message', async () => {
    await dispatch('message', { data: { type: 'CLEAR_AUTH_CACHES' } })

    expect(deleteCache).not.toHaveBeenCalled()
  })

  it('uses the crag shell for an offline viewer navigation with an id query', async () => {
    shellEntries.set('/offline/crag', new Response('saved crag shell'))
    const request = new Request('https://letsboulder.com/offline/crag?id=123')
    Object.defineProperty(request, 'mode', { configurable: true, value: 'navigate' })

    const response = await dispatch('fetch', { request })

    expect(await (await response)?.text()).toBe('saved crag shell')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('opens the cached offline library without waiting for a failed network request', async () => {
    shellEntries.set('/offline/library', new Response('saved guide library'))
    const request = new Request('https://letsboulder.com/offline/library')
    Object.defineProperty(request, 'mode', { configurable: true, value: 'navigate' })

    const response = await dispatch('fetch', { request })

    expect(await (await response)?.text()).toBe('saved guide library')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('serves a packed image from CacheStorage before the network', async () => {
    const request = new Request('https://static.letsboulder.com/images/image-123/v2/topo.webp')
    Object.defineProperty(request, 'destination', { configurable: true, value: 'image' })
    mediaEntries.set(request.url, new Response('cached topo'))

    const response = await dispatch('fetch', { request })

    expect(await (await response)?.text()).toBe('cached topo')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('caches each active crag media variant after a network miss', async () => {
    for (const variant of ['detail', 'topo']) {
      const request = new Request(`https://static.letsboulder.com/images/image-123/v2/${variant}.webp`)
      Object.defineProperty(request, 'destination', { configurable: true, value: 'image' })
      const response = await dispatch('fetch', { request })
      expect(await (await response)?.text()).toBe('asset')
      expect(mediaCache.put).toHaveBeenCalledWith(request, expect.any(Response))
    }
  })

  it('returns a 504 packed-media response when an uncached asset cannot be fetched', async () => {
    fetchMock.mockRejectedValueOnce(new Error('offline'))
    const request = new Request('https://static.letsboulder.com/images/image-123/v2/topo.webp')
    Object.defineProperty(request, 'destination', { configurable: true, value: 'image' })

    const response = await dispatch('fetch', { request })

    expect(response).toBeDefined()
    expect((await response)?.status).toBe(504)
  })

  it('fetches and caches a missing Next static asset', async () => {
    const request = new Request('https://letsboulder.com/_next/static/chunks/offline.js')
    const response = await dispatch('fetch', { request })

    expect(await (await response)?.text()).toBe('asset')
    expect(staticCache.put).toHaveBeenCalledWith(request, expect.any(Response))
  })

  it('serves cached Next code after a worker restart without fetching the build manifest', async () => {
    await dispatch('install')
    handlers.clear()
    fetchMock.mockClear()
    fetchMock.mockRejectedValue(new Error('airplane mode'))
    vi.resetModules()
    await import('../../public/sw.js')

    const request = new Request('https://letsboulder.com/_next/static/chunks/offline.js')
    staticEntries.set(request.url, new Response('cached app code'))
    const response = await dispatch('fetch', { request })

    expect(await (await response)?.text()).toBe('cached app code')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('does not intercept unrelated remote images', async () => {
    const request = new Request('https://images.example.com/photo.webp')
    Object.defineProperty(request, 'destination', { configurable: true, value: 'image' })

    const response = await dispatch('fetch', { request })

    expect(response).toBeUndefined()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('does not intercept non-pack media paths on an approved CDN', async () => {
    const request = new Request('https://static.letsboulder.com/images/image-123/original.webp')
    Object.defineProperty(request, 'destination', { configurable: true, value: 'image' })

    const response = await dispatch('fetch', { request })

    expect(response).toBeUndefined()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
