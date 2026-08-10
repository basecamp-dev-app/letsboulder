export const OFFLINE_MEDIA_CACHE = 'letsboulder-offline-immutable-v1'

export interface OfflineMediaCache {
  has(url: string): Promise<boolean>
  download(url: string, fetcher: typeof fetch, expectedMediaType?: string | null): Promise<number>
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

  async download(url: string, fetcher: typeof fetch, expectedMediaType?: string | null): Promise<number> {
    const response = await fetcher(url, { cache: 'no-store', credentials: 'omit' })
    if (!response.ok) throw new Error(`Asset request failed (${response.status}): ${url}`)
    if (response.type === 'opaque') throw new Error(`Asset response cannot be validated: ${url}`)
    const contentType = response.headers.get('content-type')?.toLowerCase() ?? ''
    if (contentType.includes('text/html') || contentType.includes('application/json')) {
      throw new Error(`Asset response has unexpected content type: ${url}`)
    }
    if (expectedMediaType && contentType.split(';', 1)[0] !== expectedMediaType.toLowerCase()) {
      throw new Error(`Asset response media type does not match: ${url}`)
    }
    const body = await response.clone().arrayBuffer()
    if (body.byteLength === 0) throw new Error(`Asset response is empty: ${url}`)
    const declaredLength = response.headers.get('content-length')
    if (declaredLength !== null && Number(declaredLength) !== body.byteLength) {
      throw new Error(`Asset response length does not match: ${url}`)
    }
    await (await this.open()).put(url, response)
    return body.byteLength
  }

  async remove(url: string): Promise<void> {
    await (await this.open()).delete(url)
  }

  async keys(): Promise<string[]> {
    return (await (await this.open()).keys()).map((request) => request.url)
  }
}
