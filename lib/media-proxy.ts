const PRIVATE_URL_PREFIX = 'private://'

export interface ParsedPrivateMediaRef {
  bucket: string
  path: string
}

export function parsePrivateMediaRef(rawUrl: string | null | undefined): ParsedPrivateMediaRef | null {
  if (!rawUrl || !rawUrl.startsWith(PRIVATE_URL_PREFIX)) return null

  const withoutPrefix = rawUrl.slice(PRIVATE_URL_PREFIX.length)
  const firstSlashIndex = withoutPrefix.indexOf('/')
  if (firstSlashIndex <= 0) return null

  const bucket = withoutPrefix.slice(0, firstSlashIndex)
  const path = withoutPrefix.slice(firstSlashIndex + 1)
  if (!bucket || !path) return null

  return { bucket, path }
}

export function buildMediaProxyUrl(bucket: string, path: string, version?: string | null): string {
  const encodedPath = path
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/')

  const query = version ? `?v=${encodeURIComponent(version)}` : ''
  return `/api/media/${encodeURIComponent(bucket)}/${encodedPath}${query}`
}

export function estimateCompressedImageBytes(width: number | null | undefined, height: number | null | undefined): number {
  if (!width || !height || width <= 0 || height <= 0) {
    return 400 * 1024
  }

  const estimated = Math.round(width * height * 0.10)
  return Math.max(150 * 1024, estimated)
}
