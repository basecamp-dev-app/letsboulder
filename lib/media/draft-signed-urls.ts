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
  }>
}

const signedUrlCache = new Map<string, string>()

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
    if (cached) {
      results.set(cacheKey, cached)
      continue
    }
    missing.push(object)
  }

  if (missing.length === 0) {
    return results
  }

  const response = await csrfFetch('/api/uploads/signed-urls/batch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ objects: missing }),
  })

  if (!response.ok) {
    throw new Error('Failed to load signed draft image URLs')
  }

  const payload = await response.json().catch(() => ({} as DraftSignedUrlResponse))
  for (const item of payload.results || []) {
    if (typeof item.bucket !== 'string' || typeof item.path !== 'string' || typeof item.signedUrl !== 'string' || !item.signedUrl) {
      continue
    }

    const cacheKey = getDraftSignedUrlCacheKey(item.bucket, item.path)
    signedUrlCache.set(cacheKey, item.signedUrl)
    results.set(cacheKey, item.signedUrl)
  }

  return results
}
