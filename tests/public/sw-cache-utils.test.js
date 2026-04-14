import { beforeEach, describe, expect, test, vi } from 'vitest'

const fetchMock = vi.fn()

vi.stubGlobal('fetch', fetchMock)
vi.stubGlobal('Request', Request)

beforeEach(() => {
  fetchMock.mockReset()
})

describe('sw-cache-utils', () => {
  test('cacheRequiredPageAssets throws when a required page cannot be fetched', async () => {
    fetchMock.mockResolvedValueOnce(new Response('', { status: 503 }))

    await import('../../public/sw-cache-utils.js')

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
      .mockResolvedValueOnce(new Response('<script src="/_next/static/chunks/route.js"></script><link href="/_next/static/css/app.css" rel="stylesheet" />', { status: 200 }))
      .mockResolvedValueOnce(new Response('js', { status: 200 }))
      .mockResolvedValueOnce(new Response('css', { status: 200 }))

    await import('../../public/sw-cache-utils.js')

    await globalThis.cacheRequiredPageAssets(['/gb/crag-one/i/image-1?climb=climb-1'])

    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(fetchMock.mock.calls[1]?.[0]).toBeInstanceOf(Request)
    expect(fetchMock.mock.calls[2]?.[0]).toBeInstanceOf(Request)
  })

  test('collectShellAssetRequests includes theme-init and preloaded font assets', async () => {
    fetchMock.mockResolvedValue(new Response(`
      <script src="/theme-init.js"></script>
      <link rel="preload" href="/_next/static/media/font.woff2" as="font" type="font/woff2" crossorigin>
      <script src="/_next/static/chunks/app.js"></script>
    `, { status: 200 }))

    await import('../../public/sw-cache-utils.js')

    const requests = await globalThis.collectShellAssetRequests()
    const urls = requests.map((request) => new URL(request.url).pathname)

    expect(urls).toContain('/theme-init.js')
    expect(urls).toContain('/_next/static/media/font.woff2')
    expect(urls).toContain('/_next/static/chunks/app.js')
  })

  test('collectAssetRequestsFromPage uses the shared asset extractor', async () => {
    fetchMock.mockResolvedValue(new Response(`
      <script src="/theme-init.js"></script>
      <link rel="preload" href="/_next/static/media/font.woff2" as="font" type="font/woff2" crossorigin>
    `, { status: 200 }))

    await import('../../public/sw-cache-utils.js')

    const requests = await globalThis.collectAssetRequestsFromPage('/ch/murgtal-2')
    const urls = requests.map((request) => new URL(request.url).pathname)

    expect(urls).toContain('/theme-init.js')
    expect(urls).toContain('/_next/static/media/font.woff2')
  })
})
