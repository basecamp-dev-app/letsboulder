const PRIVATE_URL_PREFIX = 'private://'

function buildCdnUrl(objectPath: string): string | null {
  const cdnBaseUrl = process.env.MEDIA_CDN_BASE_URL?.replace(/\/$/, '')
  if (!cdnBaseUrl || !objectPath) return null
  const normalizedPath = objectPath.split('/').filter(Boolean).map((segment) => encodeURIComponent(segment)).join('/')
  return `${cdnBaseUrl}/${normalizedPath}`
}

function buildMediaProxyPath(bucket: string, objectPath: string): string {
  const encodedPath = objectPath
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/')

  return `/api/media/${encodeURIComponent(bucket)}/${encodedPath}`
}

export function resolveRouteImageUrl(url: string | null | undefined): string {
  if (!url) return ''

  if (!url.startsWith(PRIVATE_URL_PREFIX)) return url

  const withoutPrefix = url.slice(PRIVATE_URL_PREFIX.length)
  const firstSlashIndex = withoutPrefix.indexOf('/')
  if (firstSlashIndex <= 0) return url

  const bucket = withoutPrefix.slice(0, firstSlashIndex)
  const objectPath = withoutPrefix.slice(firstSlashIndex + 1)
  if (!objectPath) return url

  if (bucket === process.env.R2_PUBLIC_BUCKET) {
    return buildCdnUrl(objectPath) || url
  }

  return buildMediaProxyPath(bucket, objectPath)
}
