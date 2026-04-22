import { resolveRouteImageUrl } from '@/lib/media/route-image-url'

const PRIVATE_URL_PREFIX = 'private://'
const LB_MEDIA_MARKER = 'lb-media'

export interface BuildThumbnailOptions {
  storageUrl?: string | null
  source?: 'default' | 'api-media'
}

function parseStorageUrl(url: string): { bucket: string; path: string } | null {
  if (!url) return null

  if (url.startsWith(PRIVATE_URL_PREFIX)) {
    const withoutPrefix = url.slice(PRIVATE_URL_PREFIX.length)
    const slashIndex = withoutPrefix.indexOf('/')
    if (slashIndex <= 0) return null

    const bucket = withoutPrefix.slice(0, slashIndex)
    const path = withoutPrefix.slice(slashIndex + 1)
    if (!path) return null

    return { bucket, path }
  }

  return null
}

function buildApiMediaUrl(bucket: string, objectPath: string, width: number, quality: number): string {
  const encodedBucket = encodeURIComponent(bucket)
  const encodedPath = objectPath
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/')

  const searchParams = new URLSearchParams()
  searchParams.set('w', String(width))
  searchParams.set('q', String(quality))
  searchParams.set(LB_MEDIA_MARKER, 'app')

  return `/api/media/${encodedBucket}/${encodedPath}?${searchParams.toString()}`
}

export function buildThumbnailUrl(
  url: string | null | undefined,
  width: number,
  quality = 72,
  options?: BuildThumbnailOptions
): string {
  const source = options?.source ?? 'default'
  const storageUrl = options?.storageUrl ?? null

  if (source === 'api-media') {
    const parsed = storageUrl ? parseStorageUrl(storageUrl) : null
    if (!parsed) {
      return ''
    }

    return buildApiMediaUrl(parsed.bucket, parsed.path, width, quality)
  }

  const resolvedUrl = resolveRouteImageUrl(url)
  if (!resolvedUrl) return ''

  if (!resolvedUrl.startsWith('/api/media/')) {
    return resolvedUrl
  }

  const [basePath, existingQuery = ''] = resolvedUrl.split('?')
  const searchParams = new URLSearchParams(existingQuery)
  searchParams.set('w', String(width))
  if (!searchParams.has('q')) {
    searchParams.set('q', String(quality))
  }

  return `${basePath}?${searchParams.toString()}`
}
