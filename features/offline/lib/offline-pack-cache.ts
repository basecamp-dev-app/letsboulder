export const OFFLINE_MEDIA_CACHE = 'letsboulder-offline-immutable-v1'

export interface OfflineCachedAssetVerification {
  byteCount: number
  digest: `sha256:${string}`
  mediaType: string
}

export interface OfflineMediaCache {
  has(url: string): Promise<boolean>
  verify?(url: string, expectedMediaType: string | null, expectedByteCount: number, expectedDigest: `sha256:${string}`): Promise<OfflineCachedAssetVerification>
  download(url: string, fetcher: typeof fetch, expectedMediaType?: string | null, expectedByteCount?: number, expectedDigest?: `sha256:${string}`): Promise<number>
  remove(url: string): Promise<void>
  keys(): Promise<string[]>
}

export class CacheApiOfflineMediaCache implements OfflineMediaCache {
  private async open(): Promise<Cache> {
    if (!('caches' in globalThis) || !globalThis.caches) throw new Error('Cache API is unavailable')
    return caches.open(OFFLINE_MEDIA_CACHE)
  }

  async has(url: string): Promise<boolean> {
    return Boolean(await (await this.open()).match(url))
  }

  private async validate(response: Response, url: string, expectedMediaType: string | null, expectedByteCount: number | undefined, expectedDigest: `sha256:${string}` | undefined): Promise<OfflineCachedAssetVerification> {
    const contentType = response.headers.get('content-type')?.toLowerCase().split(';', 1)[0] ?? ''
    if (expectedMediaType && contentType !== expectedMediaType.toLowerCase()) throw new Error(`Asset response media type does not match: ${url}`)
    const body = await response.clone().arrayBuffer()
    if (body.byteLength === 0) throw new Error(`Asset response is empty: ${url}`)
    if (expectedByteCount !== undefined && body.byteLength !== expectedByteCount) throw new Error(`Asset response byte count does not match: ${url}`)
    const declaredLength = response.headers.get('content-length')
    if (declaredLength !== null && Number(declaredLength) !== body.byteLength) throw new Error(`Asset response length does not match: ${url}`)
    const digestBytes = await crypto.subtle.digest('SHA-256', body)
    const digest = `sha256:${Array.from(new Uint8Array(digestBytes), (byte) => byte.toString(16).padStart(2, '0')).join('')}` as const
    if (expectedDigest !== undefined && digest !== expectedDigest) throw new Error(`Asset response digest does not match: ${url}`)
    return { byteCount: body.byteLength, digest, mediaType: contentType }
  }

  async verify(url: string, expectedMediaType: string | null, expectedByteCount: number, expectedDigest: `sha256:${string}`): Promise<OfflineCachedAssetVerification> {
    const response = await (await this.open()).match(url)
    if (!response) throw new Error(`Required cached asset is missing: ${url}`)
    return this.validate(response, url, expectedMediaType, expectedByteCount, expectedDigest)
  }

  async download(url: string, fetcher: typeof fetch, expectedMediaType: string | null = null, expectedByteCount?: number, expectedDigest?: `sha256:${string}`): Promise<number> {
    const response = await fetcher(url, { cache: 'no-store', credentials: 'omit' })
    if (!response.ok) throw new Error(`Asset request failed (${response.status}): ${url}`)
    if (response.type === 'opaque') throw new Error(`Asset response cannot be validated: ${url}`)
    const contentType = response.headers.get('content-type')?.toLowerCase() ?? ''
    if (contentType.includes('text/html') || contentType.includes('application/json')) {
      throw new Error(`Asset response has unexpected content type: ${url}`)
    }
    const verification = await this.validate(response, url, expectedMediaType, expectedByteCount, expectedDigest)
    await (await this.open()).put(url, response)
    return verification.byteCount
  }

  async remove(url: string): Promise<void> {
    await (await this.open()).delete(url)
  }

  async keys(): Promise<string[]> {
    return (await (await this.open()).keys()).map((request) => request.url)
  }
}
