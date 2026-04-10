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
  if (!target) {
    if (routeHrefBase) return `${routeHrefBase}/i/${imageId}`
    return `/image/${imageId}`
  }

  const next = new URLSearchParams()
  next.set('image', target.imageId)
  next.set('route', target.routeId)
  next.set('climb', target.climbId)

  const imageFirstBase = target.climbSlug && routeHrefBase ? routeHrefBase : null

  if (imageFirstBase) {
    return `${imageFirstBase}/i/${imageId}?${next.toString()}`
  }

  if (offlineOnly) {
    return `/climb/${target.climbId}?${next.toString()}`
  }

  if (routeHrefBase) {
    return `${routeHrefBase}/i/${imageId}?${next.toString()}`
  }

  return `/image/${imageId}?${next.toString()}`
}
