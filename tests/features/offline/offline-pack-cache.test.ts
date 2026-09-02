import { beforeEach, describe, expect, test, vi } from 'vitest'
import { CacheApiOfflineMediaCache, OFFLINE_MEDIA_CACHE } from '@/features/offline/lib/offline-pack-cache'

const ABC_DIGEST = 'sha256:ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad' as const

const entries = new Map<string, Response>()
const cache = {
  match: vi.fn(async (url: string) => entries.get(url)),
  put: vi.fn(async (url: string, response: Response) => { entries.set(url, response) }),
  delete: vi.fn(async (url: string) => entries.delete(url)),
  keys: vi.fn(async () => [...entries].map(([url]) => new Request(url))),
}

function response(body: string, headers: Record<string, string> = {}): Response {
  return new Response(body, { status: 200, headers: { 'content-type': 'image/webp', ...headers } })
}

describe('CacheApiOfflineMediaCache', () => {
  beforeEach(() => {
    entries.clear()
    vi.clearAllMocks()
    vi.stubGlobal('caches', { open: vi.fn(async (name: string) => { expect(name).toBe(OFFLINE_MEDIA_CACHE); return cache }) })
  })

  test('rejects when Cache API is unavailable', async () => {
    vi.stubGlobal('caches', undefined)
    await expect(new CacheApiOfflineMediaCache().has('/asset.webp')).rejects.toThrow('Cache API is unavailable')
  })

  test.each([
    ['non-2xx responses', response('bad', { 'content-type': 'image/webp' }).clone(), 'Asset request failed'],
    ['opaque responses', response('body'), 'Asset response cannot be validated'],
    ['wrong content type', response('<html>', { 'content-type': 'text/html' }), 'unexpected content type'],
    ['empty responses', response(''), 'response is empty'],
    ['incorrect content length', response('abc', { 'content-length': '4' }), 'length does not match'],
  ])('rejects %s without persistence', async (_name, candidate, message) => {
    const fetcher = vi.fn(async () => candidate as Response) as unknown as typeof fetch
    if (_name === 'non-2xx responses') Object.defineProperty(candidate, 'status', { value: 503 })
    if (_name === 'non-2xx responses') Object.defineProperty(candidate, 'ok', { value: false })
    if (_name === 'opaque responses') Object.defineProperty(candidate, 'type', { value: 'opaque' })
    await expect(new CacheApiOfflineMediaCache().download('/asset.webp', fetcher)).rejects.toThrow(message)
    expect(cache.put).not.toHaveBeenCalled()
  })

  test('rejects a declared media type mismatch', async () => {
    const fetcher = vi.fn(async () => response('abc')) as unknown as typeof fetch
    await expect(new CacheApiOfflineMediaCache().download('/asset.webp', fetcher, 'image/png')).rejects.toThrow('media type does not match')
  })

  test('persists successful downloads and removes them', async () => {
    const fetcher = vi.fn(async () => response('abc')) as unknown as typeof fetch
    await expect(new CacheApiOfflineMediaCache().download('/asset.webp', fetcher, 'image/webp')).resolves.toBe(3)
    await expect(new CacheApiOfflineMediaCache().has('/asset.webp')).resolves.toBe(true)
    await new CacheApiOfflineMediaCache().remove('/asset.webp')
    await expect(new CacheApiOfflineMediaCache().has('/asset.webp')).resolves.toBe(false)
  })

  test('checks exact bytes and SHA-256 before persistence and on local revalidation', async () => {
    const fetcher = vi.fn(async () => response('abc')) as unknown as typeof fetch
    const media = new CacheApiOfflineMediaCache()
    await expect(media.download('/asset.webp', fetcher, 'image/webp', 3, ABC_DIGEST)).resolves.toBe(3)
    await expect(media.verify('/asset.webp', 'image/webp', 3, ABC_DIGEST)).resolves.toMatchObject({ byteCount: 3, digest: ABC_DIGEST })
    await expect(media.verify('/asset.webp', 'image/webp', 4, ABC_DIGEST)).rejects.toThrow('byte count does not match')
    await expect(media.verify('/asset.webp', 'image/webp', 3, `sha256:${'0'.repeat(64)}`)).rejects.toThrow('digest does not match')
  })
})
