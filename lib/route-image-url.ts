const PRIVATE_URL_PREFIX = 'private://'

function buildMediaHostUrl(path: string): string {
  const cdnUrl = process.env.NEXT_PUBLIC_MEDIA_CDN_URL?.replace(/\/$/, '')
  if (!cdnUrl) return path
  return `${cdnUrl}${path}`
}

function buildCdnUrl(objectPath: string): string | null {
  const cdnBaseUrl = process.env.NEXT_PUBLIC_MEDIA_CDN_URL?.replace(/\/$/, '')
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

  if (url.startsWith('/images/') || url.startsWith('/originals/') || url.startsWith('/cdn-cgi/')) {
    if (url.includes('?')) {
      return buildMediaHostUrl(url)
    }
    if (url.startsWith('/images/originals/') || url.startsWith('/originals/')) {
      const basePath = url.startsWith('/') ? url : `/${url}`
      return `${buildMediaHostUrl(basePath)}?variant=detail&format=webp`
    }
    return buildMediaHostUrl(url)
  }

  if (url.startsWith('/')) {
    return url
  }

  if (url.startsWith('https://') || url.startsWith('http://')) {
    return url
  }

  if (!url.startsWith(PRIVATE_URL_PREFIX)) return url

  const withoutPrefix = url.slice(PRIVATE_URL_PREFIX.length)
  const firstSlashIndex = withoutPrefix.indexOf('/')
  if (firstSlashIndex <= 0) return url

  const bucket = withoutPrefix.slice(0, firstSlashIndex)
  const objectPath = withoutPrefix.slice(firstSlashIndex + 1)
  if (!objectPath) return url

  const cdnUrl = buildCdnUrl(objectPath)
  if (cdnUrl) return cdnUrl

  return buildMediaProxyPath(bucket, objectPath)
}
