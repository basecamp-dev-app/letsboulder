import { beforeEach, describe, expect, test, vi } from 'vitest'

const { csrfFetch } = vi.hoisted(() => ({
  csrfFetch: vi.fn(),
}))

vi.mock('@/hooks/useCsrf', () => ({ csrfFetch }))

const object = { bucket: 'private-bucket', path: 'images/originals/route.jpg' }
const key = 'private-bucket:images/originals/route.jpg'
const secondObject = { bucket: 'private-bucket', path: 'images/originals/second-route.jpg' }

interface DraftSignedUrlResponse {
  results?: Array<{
    bucket?: string
    path?: string
    signedUrl?: string | null
    expiresAt?: number
  }>
}

function signedUrlResponse(url: string, expiresAt: number): Response {
  return {
    ok: true,
    json: vi.fn(async () => ({ results: [{ ...object, signedUrl: url, expiresAt }] })),
  } as unknown as Response
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((nextResolve) => { resolve = nextResolve })
  return { promise, resolve }
}

describe('loadDraftSignedUrls', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    vi.spyOn(Date, 'now').mockReturnValue(1_000_000)
  })

  test('reuses an unexpired URL only for its issuing user', async () => {
    csrfFetch.mockResolvedValueOnce(signedUrlResponse('https://example.com/user-one', 4_700_000))
    const { loadDraftSignedUrls, setDraftSignedUrlCacheUserId } = await import('@/lib/media/draft-signed-urls')

    setDraftSignedUrlCacheUserId('user-one')
    await loadDraftSignedUrls([object])
    expect((await loadDraftSignedUrls([object])).get(key)).toBe('https://example.com/user-one')
    expect(csrfFetch).toHaveBeenCalledTimes(1)

    setDraftSignedUrlCacheUserId('user-two')
    csrfFetch.mockResolvedValueOnce(signedUrlResponse('https://example.com/user-two', 4_700_000))
    expect((await loadDraftSignedUrls([object])).get(key)).toBe('https://example.com/user-two')
    expect(csrfFetch).toHaveBeenCalledTimes(2)
  })

  test('refreshes URLs before their expiry buffer', async () => {
    csrfFetch
      .mockResolvedValueOnce(signedUrlResponse('https://example.com/first', 1_061_000))
      .mockResolvedValueOnce(signedUrlResponse('https://example.com/refreshed', 4_700_000))
    const { loadDraftSignedUrls, setDraftSignedUrlCacheUserId } = await import('@/lib/media/draft-signed-urls')

    setDraftSignedUrlCacheUserId('user-one')
    await loadDraftSignedUrls([object])
    vi.mocked(Date.now).mockReturnValue(1_001_001)

    expect((await loadDraftSignedUrls([object])).get(key)).toBe('https://example.com/refreshed')
    expect(csrfFetch).toHaveBeenCalledTimes(2)
  })

  test('discards a response that completes after an account change', async () => {
    let resolveResponse: (response: Response) => void = () => {
      throw new Error('Response resolver was not initialized')
    }
    csrfFetch.mockImplementationOnce(() => new Promise<Response>((resolve) => {
      resolveResponse = resolve
    }))
    const { loadDraftSignedUrls, setDraftSignedUrlCacheUserId } = await import('@/lib/media/draft-signed-urls')

    setDraftSignedUrlCacheUserId('user-one')
    const pending = loadDraftSignedUrls([object])
    setDraftSignedUrlCacheUserId('user-two')
    resolveResponse(signedUrlResponse('https://example.com/user-one', 4_700_000))
    expect((await pending).get(key)).toBeUndefined()

    csrfFetch.mockResolvedValueOnce(signedUrlResponse('https://example.com/user-two', 4_700_000))
    expect((await loadDraftSignedUrls([object])).get(key)).toBe('https://example.com/user-two')
    expect(csrfFetch).toHaveBeenCalledTimes(2)
  })

  test('discards a response that completes after logout', async () => {
    let resolveResponse: (response: Response) => void = () => {
      throw new Error('Response resolver was not initialized')
    }
    csrfFetch.mockImplementationOnce(() => new Promise<Response>((resolve) => {
      resolveResponse = resolve
    }))
    const { loadDraftSignedUrls, setDraftSignedUrlCacheUserId } = await import('@/lib/media/draft-signed-urls')

    setDraftSignedUrlCacheUserId('user-one')
    const pending = loadDraftSignedUrls([object])
    setDraftSignedUrlCacheUserId(null)
    resolveResponse(signedUrlResponse('https://example.com/user-one', 4_700_000))

    expect((await pending).get(key)).toBeUndefined()
  })

  test('discards cached and parsed URLs when the account changes during JSON parsing', async () => {
    const parsed = deferred<DraftSignedUrlResponse>()
    csrfFetch
      .mockResolvedValueOnce(signedUrlResponse('https://example.com/cached', 4_700_000))
      .mockResolvedValueOnce({ ok: true, json: vi.fn(() => parsed.promise) } as unknown as Response)
    const { loadDraftSignedUrls, setDraftSignedUrlCacheUserId } = await import('@/lib/media/draft-signed-urls')

    setDraftSignedUrlCacheUserId('user-one')
    await loadDraftSignedUrls([object])
    const pending = loadDraftSignedUrls([object, secondObject])
    setDraftSignedUrlCacheUserId('user-two')
    parsed.resolve({ results: [{ ...secondObject, signedUrl: 'https://example.com/user-one', expiresAt: 4_700_000 }] })

    expect(await pending).toEqual(new Map())
  })

  test('discards a response after an ABA account transition during JSON parsing', async () => {
    const parsed = deferred<DraftSignedUrlResponse>()
    csrfFetch.mockResolvedValueOnce({ ok: true, json: vi.fn(() => parsed.promise) } as unknown as Response)
    const { loadDraftSignedUrls, setDraftSignedUrlCacheUserId } = await import('@/lib/media/draft-signed-urls')

    setDraftSignedUrlCacheUserId('user-one')
    const pending = loadDraftSignedUrls([object])
    setDraftSignedUrlCacheUserId('user-two')
    setDraftSignedUrlCacheUserId('user-one')
    parsed.resolve({ results: [{ ...object, signedUrl: 'https://example.com/user-one', expiresAt: 4_700_000 }] })

    expect(await pending).toEqual(new Map())
  })

  test('does not cache failed requests so a later load retries', async () => {
    csrfFetch
      .mockResolvedValueOnce({ ok: false } as Response)
      .mockResolvedValueOnce(signedUrlResponse('https://example.com/retried', 4_700_000))
    const { loadDraftSignedUrls, setDraftSignedUrlCacheUserId } = await import('@/lib/media/draft-signed-urls')

    setDraftSignedUrlCacheUserId('user-one')
    await expect(loadDraftSignedUrls([object])).rejects.toThrow('Failed to load signed draft image URLs')
    expect((await loadDraftSignedUrls([object])).get(key)).toBe('https://example.com/retried')
    expect(csrfFetch).toHaveBeenCalledTimes(2)
  })
})
