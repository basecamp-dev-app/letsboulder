export interface ImageRouteTarget {
  climbId: string
  routeId: string
  climbSlug: string | null
  imageId: string
}

interface BuildCragImageDestinationOptions {
  imageId: string
  target?: ImageRouteTarget
  routeHrefBase: string | null
  offlineOnly: boolean
}

export function buildCragImageDestination({
  imageId,
  target,
  routeHrefBase,
  offlineOnly,
}: BuildCragImageDestinationOptions) {
  if (!target) return `/image/${imageId}`

  const next = new URLSearchParams()
  next.set('image', target.imageId)
  next.set('route', target.routeId)

  if (offlineOnly) {
    return `/climb/${target.climbId}?${next.toString()}`
  }

  if (target.climbSlug && routeHrefBase) {
    return `${routeHrefBase}/${target.climbSlug}?${next.toString()}`
  }

  return `/climb/${target.climbId}?${next.toString()}`
}
