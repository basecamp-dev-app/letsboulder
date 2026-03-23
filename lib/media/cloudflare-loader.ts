import type { ImageLoaderProps } from 'next/image'
import { MEDIA_VARIANT_WIDTHS, type MediaVariantKey } from '@/apps/media-worker/src/config'

const API_MEDIA_PREFIX = '/api/media/'

const VARIANT_ORDER: MediaVariantKey[] = ['thumb', 'card', 'detail', 'topo', 'full']

function snapWidthToVariant(width: number): MediaVariantKey {
  for (const variant of VARIANT_ORDER) {
    if (width <= MEDIA_VARIANT_WIDTHS[variant]) return variant
  }
  return 'full'
}

function getMediaHost(): string | null {
  return process.env.NEXT_PUBLIC_MEDIA_CDN_URL?.replace(/\/$/, '') || null
}

function isMediaWorkerUrl(url: URL): boolean {
  const host = getMediaHost()
  if (!host) return false
  try {
    return url.origin === new URL(host).origin
  } catch {
    return false
  }
}

function isLocalApiMediaUrl(url: URL): boolean {
  return url.pathname.startsWith(API_MEDIA_PREFIX)
}

function extractObjectKey(pathname: string): string | null {
  const key = pathname.slice(1)  // Remove leading slash
  return key || null
}

function buildWorkerVariantUrl(
  host: string,
  objectKey: string,
  variant: MediaVariantKey,
): string {
  const encodedKey = objectKey.split('/').map(encodeURIComponent).join('/')
  return `${host}/${encodedKey}?variant=${variant}&format=webp`
}

function transformStaticVariantPath(pathname: string, requestedVariant: string, format: string = 'webp'): string | null {
  const variantPattern = /^(.*\/v1\/)([a-z0-9_-]+)\.([a-z0-9]+)$/i
  const match = pathname.match(variantPattern)

  if (!match) return null

  const [, prefix, currentVariant, ext] = match

  if (currentVariant === requestedVariant && ext === format) {
    return pathname
  }

  return `${prefix}${requestedVariant}.${format}`
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

  if (isLocalApiMediaUrl(parsed)) {
    parsed.searchParams.set('w', String(width))
    return `${parsed.pathname}${parsed.search}`
  }

  // Media worker URL → return worker URL with snapped variant
  if (isMediaWorkerUrl(parsed) && mediaHost) {
    const key = extractObjectKey(parsed.pathname)
    if (key) {
      const normalizedKey = key.startsWith('/') ? key : `/${key}`
      const staticVariantPath = transformStaticVariantPath(normalizedKey, variant)

      if (staticVariantPath) {
        const safeHost = mediaHost.endsWith('/') ? mediaHost.slice(0, -1) : mediaHost
        return `${safeHost}${staticVariantPath}`
      }

      return buildWorkerVariantUrl(mediaHost, key, variant)
    }
  }

  let normalizedSrc = trimmed
  try {
    const normalizedUrl = new URL(trimmed)
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') || null
    const isSameOrigin = normalizedUrl.origin === 'http://localhost'
      || normalizedUrl.origin === siteUrl

    if (isSameOrigin) {
      normalizedSrc = `${normalizedUrl.pathname}${normalizedUrl.search}`
    }
  } catch {
    // Relative path; keep as-is.
  }

  // Local images on same origin → use /cdn-cgi/image/ for CF Image Resizing
  if (normalizedSrc.startsWith('/') && !normalizedSrc.startsWith('//')) {
    const params = [`width=${width}`, `quality=${quality || 75}`, 'format=auto']
    return `/cdn-cgi/image/${params.join(',')}${normalizedSrc}`
  }

  return trimmed
}
