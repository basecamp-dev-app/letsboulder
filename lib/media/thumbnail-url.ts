import { resolveRouteImageUrl } from '@/lib/media/route-image-url'

export function buildThumbnailUrl(url: string | null | undefined, width: number, quality = 72): string {
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
