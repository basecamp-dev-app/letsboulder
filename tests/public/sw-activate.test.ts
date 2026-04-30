import { beforeEach, describe, expect, test, vi } from 'vitest'

vi.stubGlobal('self', {
  __WB_DISABLE_DEV_LOGS: true,
  location: { origin: 'https://letsboulder.com' },
  addEventListener: vi.fn(),
  clients: { claim: vi.fn(async () => undefined) },
})

vi.stubGlobal('BroadcastChannel', class {
  postMessage() {}
  close() {}
})

vi.stubGlobal('Request', class extends Request {
  constructor(input: string | URL | Request, init?: RequestInit) {
    const normalizedInput = typeof input === 'string' && input.startsWith('/')
      ? new URL(input, 'https://letsboulder.com').toString()
      : input
    super(normalizedInput, init)
  }
})

vi.stubGlobal('Response', Response)
vi.stubGlobal('SW_BUILD_ASSET_MANIFEST_URL', '/sw-build-assets.json')
vi.stubGlobal('caches', {
  keys: vi.fn(async () => ['offline-shell-v3', 'offline-shell-v4', 'offline-route-assets-v2', 'offline-build-assets-old', 'offline-build-assets-new', 'stale-cache']),
  delete: vi.fn(async () => true),
  open: vi.fn(async () => ({
    keys: vi.fn(async () => [
      new Request('https://letsboulder.com/_next/static/chunks/app.js'),
      new Request('https://letsboulder.com/_next/static/chunks/app.css'),
    ]),
    delete: vi.fn(async () => true),
  })),
})

vi.stubGlobal('fetch', vi.fn())
vi.stubGlobal('importScripts', vi.fn())
vi.stubGlobal('ACTIVE_CACHES', ['offline-shell-v4', 'offline-route-assets-v2'])
vi.stubGlobal('BUILD_ASSET_CACHE_PREFIX', 'offline-build-assets')
vi.stubGlobal('handleMessageEvent', vi.fn())
vi.stubGlobal('handleShellFetch', vi.fn())
vi.stubGlobal('handleRouteAssetFetch', vi.fn())
vi.stubGlobal('matchCachedRequest', vi.fn())
vi.stubGlobal('installShell', vi.fn(async () => undefined))
vi.stubGlobal('purgeStaleBuildAssetCaches', vi.fn(async () => undefined))
vi.stubGlobal('toSameOriginRequest', (url: string) => new Request(url.startsWith('/') ? `https://letsboulder.com${url}` : url))

vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ version: 'new', assets: [] }), { status: 200 }))

describe('service worker activate', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  test('removes only obsolete caches during activate', async () => {
    await import('../../public/sw-constants.js')
    await import('../../public/sw-cache-utils.js')
    await import('../../public/sw-matchers.js')
    await import('../../public/sw-fetch-handlers.js')
    await import('../../public/sw-message-handlers.js')
    await import('../../public/sw.js')

    const addEventListener = vi.mocked(self.addEventListener)
    const activateHandler = addEventListener.mock.calls.find(([type]) => (type as string) === 'activate')?.[1]

    expect(typeof activateHandler).toBe('function')

    let pending: Promise<unknown> | undefined
    const waitUntil = vi.fn((promise: Promise<unknown>) => {
      pending = promise
    })
    activateHandler?.({ waitUntil } as unknown as ExtendableEvent)
    await pending

    expect(caches.delete).toHaveBeenCalledWith('stale-cache')
    expect(caches.delete).toHaveBeenCalledWith('offline-shell-v3')
    expect(caches.delete).not.toHaveBeenCalledWith('offline-shell-v4')
    expect(caches.delete).not.toHaveBeenCalledWith('offline-route-assets-v2')
    expect(caches.delete).toHaveBeenCalledWith('offline-build-assets-old')
    expect(caches.delete).not.toHaveBeenCalledWith('offline-build-assets-new')
    expect(caches.open).not.toHaveBeenCalled()
  })
})
