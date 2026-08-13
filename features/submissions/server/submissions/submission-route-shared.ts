export function parsePrivateStorageUrl(url: string): { bucket: string; path: string } | null {
  if (!url.startsWith('private://')) return null
  const withoutScheme = url.slice('private://'.length)
  const slashIndex = withoutScheme.indexOf('/')
  if (slashIndex <= 0) return null

  const bucket = withoutScheme.slice(0, slashIndex)
  const path = withoutScheme.slice(slashIndex + 1)
  if (!bucket || !path) return null

  return { bucket, path }
}
