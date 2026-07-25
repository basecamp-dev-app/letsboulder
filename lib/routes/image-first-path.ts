interface ImageFirstPathOptions {
  countryCode: string
  cragSlug: string
  imageId: string
  route?: string | null
  climbId?: string | null
}

export function buildImageFirstPath({
  countryCode,
  cragSlug,
  imageId,
  route,
  climbId,
}: ImageFirstPathOptions) {
  const params = new URLSearchParams()
  if (route) params.set('route', route)
  if (climbId) params.set('climb', climbId)
  const query = params.toString()

  return `/${countryCode.toLowerCase()}/${cragSlug}/i/${imageId}${query ? `?${query}` : ''}`
}
