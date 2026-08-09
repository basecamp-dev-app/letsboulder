import { getVariantForWidth, type MediaVariantKey } from '@/apps/media-worker/src/config'
import { clientEnv } from '@/lib/env-client'
import { resolveRouteImageUrl } from '@/lib/media/route-image-url'

export interface BuildThumbnailOptions {
  storageUrl?: string | null
  source?: 'default' | 'api-media'
}

const API_MEDIA_PREFIX = '/api/media/'
function snapWidthToVariant(width: number): MediaVariantKey {
  return getVariantForWidth(width)
}

function getMediaHost(): string | null {
  return clientEnv.NEXT_PUBLIC_MEDIA_CDN_URL?.replace(/\/$/, '') || null
}

function buildWorkerVariantUrl(objectKey: string, variant: MediaVariantKey, format: string): string {
  const mediaHost = getMediaHost()
  if (!mediaHost) return ''

  const encodedKey = objectKey
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/')

  return `${mediaHost}/${encodedKey}?variant=${variant}&format=${format}`
}

function transformStaticVariantPath(url: string, width: number): string | null {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }

  const mediaHost = getMediaHost()
  if (!mediaHost) return null

  let mediaHostOrigin: string
  try {
    mediaHostOrigin = new URL(mediaHost).origin
  } catch {
    return null
  }

  if (parsed.origin !== mediaHostOrigin) return null

  const variantPattern = /^(.*\/v1\/)([a-z0-9_-]+)\.([a-z0-9]+)$/i
  const match = parsed.pathname.match(variantPattern)
  if (!match) return null

  const [, prefix] = match
  const variant = snapWidthToVariant(width)
  const staticVariant = variant === 'full' ? 'detail' : variant

  return `${parsed.origin}${prefix}${staticVariant}.webp`
}

function convertApiMediaUrlToWorkerUrl(url: string, width: number): string {
  const mediaHost = getMediaHost()
  if (!mediaHost) return url

  let parsed: URL
  try {
    parsed = new URL(url, 'http://localhost')
  } catch {
    return url
  }

  if (!parsed.pathname.startsWith(API_MEDIA_PREFIX)) return url

  const pathParts = parsed.pathname.split('/').filter(Boolean)
  if (pathParts.length < 4) return url

  const bucket = decodeURIComponent(pathParts[2] || '')
  const objectPath = pathParts.slice(3).map(decodeURIComponent).join('/')
  if (!bucket || !objectPath) return url

  return buildWorkerVariantUrl(`${bucket}/${objectPath}`, snapWidthToVariant(width), 'auto')
}

function updateWorkerUrl(url: string, width: number): string {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return url
  }

  const mediaHost = getMediaHost()
  if (!mediaHost) return url

  let mediaHostOrigin: string
  try {
    mediaHostOrigin = new URL(mediaHost).origin
  } catch {
    return url
  }

  if (parsed.origin !== mediaHostOrigin) return url

  parsed.searchParams.set('variant', snapWidthToVariant(width))
  parsed.searchParams.set('format', 'auto')
  parsed.searchParams.delete('w')
  parsed.searchParams.delete('q')

  return parsed.toString()
}

export function buildThumbnailUrl(
  url: string | null | undefined,
  width: number,
  quality = 72,
  options?: BuildThumbnailOptions
): string {
  const resolvedUrl = resolveRouteImageUrl(options?.storageUrl || url)
  if (!resolvedUrl) return ''

  if (resolvedUrl.startsWith(API_MEDIA_PREFIX)) {
    return convertApiMediaUrlToWorkerUrl(resolvedUrl, width)
  }

  if (resolvedUrl.startsWith('http://') || resolvedUrl.startsWith('https://')) {
    const staticVariantUrl = transformStaticVariantPath(resolvedUrl, width)
    if (staticVariantUrl) return staticVariantUrl

    return updateWorkerUrl(resolvedUrl, width)
  }

  const normalizedQuality = quality
  void normalizedQuality
  return resolvedUrl
}
