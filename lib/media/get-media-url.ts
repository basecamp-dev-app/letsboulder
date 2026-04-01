import { MEDIA_VARIANT_WIDTHS, type MediaVariantKey } from '@/apps/media-worker/src/config'
import { clientEnv } from '@/lib/env-client'

const MEDIA_PATH_PREFIX = '/media/'
const API_MEDIA_PREFIX = '/api/media/'

function parseMediaWorkerUrl(url: string): { key: string; host: string } | null {
  const mediaHost = clientEnv.NEXT_PUBLIC_MEDIA_CDN_URL?.replace(/\/$/, '')
  if (!mediaHost) return null

  try {
    const parsed = new URL(url, 'http://placeholder')
    const isLocalMedia = url.startsWith(MEDIA_PATH_PREFIX)
    const isWorkerUrl = parsed.origin === new URL(mediaHost).origin && parsed.pathname.startsWith(MEDIA_PATH_PREFIX)

    if (!isLocalMedia && !isWorkerUrl) return null

    const key = parsed.pathname.slice(MEDIA_PATH_PREFIX.length)
    if (!key) return null

    return { key, host: mediaHost }
  } catch {
    return null
  }
}

function parseCdnUrl(url: string): { key: string; host: string } | null {
  const mediaHost = clientEnv.NEXT_PUBLIC_MEDIA_CDN_URL?.replace(/\/$/, '')
  if (!mediaHost) return null

  try {
    const parsed = new URL(url, 'http://placeholder')
    if (parsed.origin !== new URL(mediaHost).origin) return null

    const CDN_IMAGES_PATH = '/images/'
    if (!parsed.pathname.startsWith(CDN_IMAGES_PATH)) return null

    const key = parsed.pathname.slice(CDN_IMAGES_PATH.length)
    if (!key) return null

    return { key, host: mediaHost }
  } catch {
    return null
  }
}

function buildMediaWorkerUrl(host: string, key: string, variant: MediaVariantKey, format: string): string {
  const encodedKey = key.split('/').map(encodeURIComponent).join('/')
  return `${host}${MEDIA_PATH_PREFIX}${encodedKey}?variant=${variant}&format=${format}`
}

export function getMediaUrl(
  url: string | null | undefined,
  variant: MediaVariantKey = 'detail',
  format: string = 'jpeg',
): string {
  if (!url) return ''

  const workerMatch = parseMediaWorkerUrl(url)
  if (workerMatch) {
    return buildMediaWorkerUrl(workerMatch.host, workerMatch.key, variant, format)
  }

  const cdnMatch = parseCdnUrl(url)
  if (cdnMatch) {
    return buildMediaWorkerUrl(cdnMatch.host, cdnMatch.key, variant, format)
  }

  if (url.startsWith(API_MEDIA_PREFIX)) {
    const width = MEDIA_VARIANT_WIDTHS[variant]
    try {
      const parsed = new URL(url, 'http://placeholder')
      parsed.searchParams.set('w', String(width))
      return `${parsed.pathname}${parsed.search}`
    } catch {
      return `${url}?w=${width}`
    }
  }

  return url
}
