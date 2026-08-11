import { csrfFetch } from '@/hooks/useCsrf'

interface DraftSignedUrlObject {
  bucket: string
  path: string
}

interface DraftSignedUrlResponse {
  results?: Array<{
    bucket?: string
    path?: string
    signedUrl?: string | null
    expiresAt?: number
  }>
}

interface CachedDraftSignedUrl {
  url: string
  expiresAt: number
  userId: string
}

const CACHE_REFRESH_BUFFER_MS = 60_000
const signedUrlCache = new Map<string, CachedDraftSignedUrl>()
let cacheUserId: string | null = null
let cacheUserGeneration = 0

export function setDraftSignedUrlCacheUserId(userId: string | null): void {
  cacheUserGeneration += 1
  if (cacheUserId === userId) return
  cacheUserId = userId
  signedUrlCache.clear()
}

export function getDraftSignedUrlCacheKey(bucket: string, path: string): string {
  return `${bucket}:${path}`
}

export async function loadDraftSignedUrls(objects: DraftSignedUrlObject[]): Promise<Map<string, string>> {
  const uniqueObjects = Array.from(new Map(
    objects
      .filter((object) => object.bucket && object.path)
      .map((object) => [getDraftSignedUrlCacheKey(object.bucket, object.path), object])
  ).values())

  const results = new Map<string, string>()
  const missing: DraftSignedUrlObject[] = []

  for (const object of uniqueObjects) {
    const cacheKey = getDraftSignedUrlCacheKey(object.bucket, object.path)
    const cached = signedUrlCache.get(cacheKey)
    if (cached && cached.userId === cacheUserId && cached.expiresAt > Date.now() + CACHE_REFRESH_BUFFER_MS) {
      results.set(cacheKey, cached.url)
      continue
    }
    missing.push(object)
  }

  if (missing.length === 0) {
    return results
  }

  const requestUserId = cacheUserId
  const requestUserGeneration = cacheUserGeneration
  const response = await csrfFetch('/api/uploads/signed-urls/batch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ objects: missing }),
  })

  if (requestUserId !== cacheUserId || requestUserGeneration !== cacheUserGeneration) {
    return new Map()
  }

  if (!response.ok) {
    throw new Error('Failed to load signed draft image URLs')
  }

  const payload = await response.json().catch(() => ({} as DraftSignedUrlResponse))
  if (requestUserId !== cacheUserId || requestUserGeneration !== cacheUserGeneration) {
    return new Map()
  }

  for (const item of payload.results || []) {
    if (typeof item.bucket !== 'string' || typeof item.path !== 'string' || typeof item.signedUrl !== 'string' || !item.signedUrl) {
      continue
    }

    const cacheKey = getDraftSignedUrlCacheKey(item.bucket, item.path)
    if (requestUserId && requestUserId === cacheUserId && requestUserGeneration === cacheUserGeneration && typeof item.expiresAt === 'number' && item.expiresAt > Date.now() + CACHE_REFRESH_BUFFER_MS) {
      signedUrlCache.set(cacheKey, { url: item.signedUrl, expiresAt: item.expiresAt, userId: requestUserId })
    }
    results.set(cacheKey, item.signedUrl)
  }

  return results
}
