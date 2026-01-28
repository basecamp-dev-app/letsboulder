import { OFFLINE_ASSETS_CACHE } from '@/lib/offline/constants'

export async function putInOfflineCache(url: string, response: Response) {
  const cache = await caches.open(OFFLINE_ASSETS_CACHE)
  await cache.put(url, response)
}

export async function matchOfflineCache(url: string) {
  const cache = await caches.open(OFFLINE_ASSETS_CACHE)
  return await cache.match(url)
}

export async function removeFromOfflineCache(url: string) {
  const cache = await caches.open(OFFLINE_ASSETS_CACHE)
  await cache.delete(url)
}

export async function createObjectUrlFromCache(url: string): Promise<string | null> {
  const res = await matchOfflineCache(url)
  if (!res) return null
  const blob = await res.blob()
  return URL.createObjectURL(blob)
}
