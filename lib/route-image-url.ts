const PRIVATE_URL_PREFIX = 'private://'

export function resolveRouteImageUrl(url: string | null | undefined): string {
  if (!url) return ''
  if (!url.startsWith(PRIVATE_URL_PREFIX)) return url

  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!baseUrl) return url

  const withoutPrefix = url.slice(PRIVATE_URL_PREFIX.length)
  const firstSlashIndex = withoutPrefix.indexOf('/')
  if (firstSlashIndex <= 0) return url

  const bucket = withoutPrefix.slice(0, firstSlashIndex)
  const objectPath = withoutPrefix.slice(firstSlashIndex + 1)
  if (!objectPath) return url

  const normalizedBaseUrl = baseUrl.replace(/\/$/, '')
  return `${normalizedBaseUrl}/storage/v1/object/public/${bucket}/${objectPath}`
}
