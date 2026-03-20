import type { ImageLoaderProps } from 'next/image'
import { MEDIA_VARIANT_WIDTHS, type MediaVariantKey } from '@/apps/media-worker/src/config'

const MEDIA_PATH_PREFIX = '/media/'
const API_MEDIA_PREFIX = '/api/media/'

const VARIANT_ORDER: MediaVariantKey[] = ['thumb', 'card', 'detail', 'topo', 'full']

function snapWidthToVariant(width: number): MediaVariantKey {
  for (const variant of VARIANT_ORDER) {
    if (width <= MEDIA_VARIANT_WIDTHS[variant]) return variant
  }
  return 'full'
}

function getMediaHost(): string | null {
  return process.env.NEXT_PUBLIC_MEDIA_HOST?.replace(/\/$/, '') || null
}

function isMediaWorkerUrl(url: URL): boolean {
  const host = getMediaHost()
  if (!host) return false
  try {
    return url.origin === new URL(host).origin && url.pathname.startsWith(MEDIA_PATH_PREFIX)
  } catch {
    return false
  }
}

function isLocalApiMediaUrl(url: URL): boolean {
  return url.pathname.startsWith(API_MEDIA_PREFIX)
}

function extractObjectKey(pathname: string, prefix: string): string | null {
  const key = pathname.slice(prefix.length)
  return key || null
}

function buildWorkerVariantUrl(
  host: string,
  objectKey: string,
  variant: MediaVariantKey,
): string {
  const encodedKey = objectKey.split('/').map(encodeURIComponent).join('/')
  return `${host}${MEDIA_PATH_PREFIX}${encodedKey}?variant=${variant}&format=webp`
}

export default function cloudflareLoader({ src, width, quality }: ImageLoaderProps): string {
  if (!src) return ''

  const trimmed = src.trim()

  if (trimmed.startsWith('data:') || trimmed.startsWith('blob:')) return trimmed

  let parsed: URL
  try {
    parsed = new URL(trimmed, 'http://localhost')
  } catch {
    return trimmed
  }

  const variant = snapWidthToVariant(width)
  const mediaHost = getMediaHost()

  // Media worker URL → return worker URL with snapped variant
  if (isMediaWorkerUrl(parsed) && mediaHost) {
    const key = extractObjectKey(parsed.pathname, MEDIA_PATH_PREFIX)
    if (key) return buildWorkerVariantUrl(mediaHost, key, variant)
  }

  // /api/media/ proxy URL → bypass proxy, go to media worker
  if (isLocalApiMediaUrl(parsed) && mediaHost) {
    const segments = parsed.pathname.slice(API_MEDIA_PREFIX.length).split('/')
    if (segments.length >= 2) {
      const objectKey = segments.slice(1).join('/')
      if (objectKey) return buildWorkerVariantUrl(mediaHost, objectKey, variant)
    }
  }

  // Local images on same origin → use /cdn-cgi/image/ for CF Image Resizing
  const isLocal = trimmed.startsWith('/') && !trimmed.startsWith('//')
  if (isLocal) {
    const params = [`width=${width}`]
    if (quality) params.push(`quality=${quality}`)
    return `/cdn-cgi/image/${params.join(',')}/${encodeURIComponent(trimmed)}`
  }

  return trimmed
}
