import { describe, expect, it, vi } from 'vitest'

import {
  baselineFailureKeys,
  createManifest,
  failureKey,
  type MediaSurface,
  resolveMediaUrl,
  verifySurface,
} from '@/scripts/media/verify-production-http-health'

const surface: MediaSurface = {
  surface: 'images.identity.detail',
  sourceId: 'image-1',
  imageId: 'image-1',
  cragId: 'crag-1',
  requestedUrl: 'https://static.example/images/image-1/v1/detail.webp',
}

describe('production media HTTP health verification', () => {
  it('resolves private locators through the media CDN', () => {
    expect(resolveMediaUrl('private://bucket/a path/image.webp', 'https://static.example')).toBe(
      'https://static.example/a%20path/image.webp?variant=detail&format=webp',
    )
  })

  it('requires a final 200 image response with a nonempty body', async () => {
    const fetcher = vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), {
      status: 200,
      headers: { 'Content-Type': 'image/webp; charset=binary' },
    })) as unknown as typeof fetch
    const result = await verifySurface(surface, fetcher)
    expect(result).toMatchObject({ status: 200, mime: 'image/webp', byteCount: 3, error: null })

    const emptyFetcher = vi.fn(async () => new Response(null, {
      status: 200,
      headers: { 'Content-Type': 'image/webp' },
    })) as unknown as typeof fetch
    await expect(verifySurface(surface, emptyFetcher)).resolves.toMatchObject({ error: 'Response body is empty' })
  })

  it('fails only failures absent from the baseline', () => {
    const failed = { ...surface, finalUrl: surface.requestedUrl, status: 404, mime: 'text/html', byteCount: 10, error: 'HTTP 404' }
    const baseline = baselineFailureKeys({ schemaVersion: 1, entries: [{ ...failed, failure: 'new' }] })
    expect(createManifest([failed], baseline).summary).toEqual({
      checked: 1, passed: 0, existingFailures: 1, newFailures: 0,
    })
    expect(createManifest([{ ...failed, requestedUrl: `${surface.requestedUrl}?changed=1` }], baseline).summary.newFailures).toBe(1)
  })

  it('can establish current failures as the baseline', () => {
    const failed = { ...surface, finalUrl: surface.requestedUrl, status: 404, mime: 'text/html', byteCount: 10, error: 'HTTP 404' }
    const currentFailures = new Set([failureKey(failed)])

    expect(createManifest([failed], currentFailures).summary).toEqual({
      checked: 1, passed: 0, existingFailures: 1, newFailures: 0,
    })
  })
})
