import type { RoutePoint } from '@/lib/submission-types'

export interface RouteSerializerInput {
  id: string
  name: string
  grade: string
  description?: string | undefined
  climbType?: string | undefined
  points: RoutePoint[]
  sequenceOrder: number
  imageWidth: number
  imageHeight: number
}

export interface DraftRouteLike {
  id: string
  name: string
  grade: string
  description?: string | undefined
  climbType?: string | undefined
  points: RoutePoint[]
  sequenceOrder: number
  imageWidth?: number | undefined
  imageHeight?: number | undefined
}

export function parseRoutePoints(raw: RoutePoint[] | string | null | undefined): RoutePoint[] {
  if (!raw) return []
  if (Array.isArray(raw)) {
    return raw.filter((point) => typeof point?.x === 'number' && typeof point?.y === 'number').map((point) => ({ x: point.x, y: point.y }))
  }

  try {
    const parsed = JSON.parse(raw) as RoutePoint[]
    if (!Array.isArray(parsed)) return []
    return parsed.filter((point) => typeof point?.x === 'number' && typeof point?.y === 'number').map((point) => ({ x: point.x, y: point.y }))
  } catch {
    return []
  }
}

export function areRoutePointsEqual(a: RoutePoint[], b: RoutePoint[]): boolean {
  if (a === b) return true
  if (a.length !== b.length) return false

  for (let index = 0; index < a.length; index += 1) {
    const left = a[index]
    const right = b[index]
    if (left.x !== right.x || left.y !== right.y) return false
  }

  return true
}

export function areSerializedRoutesEqual(a: DraftRouteLike[], b: DraftRouteLike[]): boolean {
  if (a === b) return true
  if (a.length !== b.length) return false

  for (let i = 0; i < a.length; i += 1) {
    const left = a[i]
    const right = b[i]
    if (
      left.id !== right.id ||
      left.name !== right.name ||
      left.grade !== right.grade ||
      (left.description || '') !== (right.description || '') ||
      (left.climbType || '') !== (right.climbType || '') ||
      left.sequenceOrder !== right.sequenceOrder ||
      (left.imageWidth || 0) !== (right.imageWidth || 0) ||
      (left.imageHeight || 0) !== (right.imageHeight || 0) ||
      !areRoutePointsEqual(left.points, right.points)
    ) {
      return false
    }
  }

  return true
}

export function buildRouteSignature(routes: RouteSerializerInput[]): string {
  return JSON.stringify(routes)
}

export function buildRouteCompletionPayload<T extends { id: string; display_order: number; route_data: Record<string, unknown> | null; width: number | null; height: number | null }>(
  images: T[],
  routesByImageId: Record<string, RouteSerializerInput[]>,
  routeType: string,
  orderedImageIds?: string[],
): Array<{ id: string; display_order: number; route_data: Record<string, unknown> }> {
  const imageOrderLookup = new Map((orderedImageIds || []).map((imageId, index) => [imageId, index]))

  return images
    .slice()
    .sort((a, b) => {
      const left = imageOrderLookup.get(a.id)
      const right = imageOrderLookup.get(b.id)
      if (typeof left === 'number' && typeof right === 'number') return left - right
      if (typeof left === 'number') return -1
      if (typeof right === 'number') return 1
      return a.display_order - b.display_order
    })
    .map((image, index) => {
      const routes = routesByImageId[image.id] || []
      const completedRoutes = routes.map((route, routeIndex) => ({
        id: route.id,
        name: route.name,
        grade: route.grade,
        description: route.description,
        climbType: route.climbType || routeType,
        points: route.points,
        sequenceOrder: routeIndex,
        imageWidth: route.imageWidth || image.width || 1200,
        imageHeight: route.imageHeight || image.height || 1200,
      }))

      const baseRouteData = image.route_data && typeof image.route_data === 'object' ? image.route_data : {}

      return {
        id: image.id,
        display_order: index,
        route_data: {
          ...baseRouteData,
          completedRoutes,
        },
      }
    })
}

export function parseSerializedRouteData(routeData: Record<string, unknown> | null, fallbackWidth: number, fallbackHeight: number) {
  const raw = routeData && typeof routeData === 'object' ? (routeData as { completedRoutes?: unknown }).completedRoutes : null
  if (!Array.isArray(raw)) return []

  const parsedRoutes: Array<RouteSerializerInput | null> = raw
    .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
    .map((item, index) => {
      const points = parseRoutePoints((item.points as RoutePoint[] | string | null | undefined) || null)
      if (points.length < 2) return null

      return {
        id: typeof item.id === 'string' && item.id ? item.id : `route-${index + 1}`,
        name: typeof item.name === 'string' && item.name.trim() ? item.name.trim() : `Route ${index + 1}`,
        grade: typeof item.grade === 'string' && item.grade ? item.grade : '6A',
        description: typeof item.description === 'string' ? item.description : undefined,
        climbType: typeof item.climbType === 'string' ? item.climbType : undefined,
        points,
        sequenceOrder: typeof item.sequenceOrder === 'number' ? item.sequenceOrder : index,
        imageWidth: typeof item.imageWidth === 'number' ? item.imageWidth : fallbackWidth,
        imageHeight: typeof item.imageHeight === 'number' ? item.imageHeight : fallbackHeight,
      }
    })
  return parsedRoutes.filter((route): route is RouteSerializerInput => route !== null)
}

export function buildRouteWorkflowSignature(input: {
  imagesPayloadSignature: string
  defaultImageId: string | null
  routeType: string
  markerLatitude: number | null
  markerLongitude: number | null
  cragId: string | null
  isAnonymousSubmission: boolean
  creditPlatform: string
  creditHandle: string | null
  sectorId: string | null
  canvasSource: { kind?: 'draft-image' | 'crag-image'; draftImageId?: string; cragImageId?: string; cragId?: string } | null
  orientationByImageId: Record<string, unknown[]>
  locationModeByImageId: Record<string, 'shared' | 'custom'>
  customGpsByImageId: Record<string, { latitude: number | null; longitude: number | null }>
}): string {
  const imageIds = Array.from(new Set([
    ...Object.keys(input.orientationByImageId),
    ...Object.keys(input.locationModeByImageId),
    ...Object.keys(input.customGpsByImageId),
  ])).sort()

  return JSON.stringify({
    imagesPayloadSignature: input.imagesPayloadSignature,
    defaultImageId: input.defaultImageId,
    submission: {
      routeType: input.routeType,
      location: {
        latitude: input.markerLatitude,
        longitude: input.markerLongitude,
      },
      isAnonymousSubmission: input.isAnonymousSubmission,
      contributionCreditPlatform: input.creditPlatform,
      contributionCreditHandle: input.creditHandle,
      sectorId: input.sectorId,
      canvasSource: input.canvasSource?.kind === 'crag-image'
        ? { kind: 'crag-image', cragImageId: input.canvasSource.cragImageId, cragId: input.canvasSource.cragId }
        : input.canvasSource?.kind === 'draft-image'
          ? { kind: 'draft-image', draftImageId: input.canvasSource.draftImageId }
          : null,
    },
    images: imageIds.map((imageId) => ({
      imageId,
      orientation: input.orientationByImageId[imageId] || [],
      locationMode: input.locationModeByImageId[imageId] === 'custom' ? 'custom' : 'shared',
      gps: {
        latitude: input.customGpsByImageId[imageId]?.latitude ?? null,
        longitude: input.customGpsByImageId[imageId]?.longitude ?? null,
      },
    })),
    cragId: input.cragId,
  })
}

export function buildHighResCanvasUrl(url: string): string {
  const trimmedUrl = url.trim()
  if (!trimmedUrl) return ''
  if (trimmedUrl.startsWith('blob:')) return trimmedUrl

  try {
    const parsedUrl = new URL(trimmedUrl, 'http://placeholder')
    const variant = parsedUrl.searchParams.get('variant')
    if (variant && variant !== 'topo' && variant !== 'full') {
      parsedUrl.searchParams.set('variant', 'topo')
      if (!parsedUrl.searchParams.has('format')) parsedUrl.searchParams.set('format', 'jpeg')
      return trimmedUrl.startsWith('/') ? `${parsedUrl.pathname}${parsedUrl.search}` : parsedUrl.toString()
    }
    if (variant === 'topo' || variant === 'full') return trimmedUrl

    const pathLower = parsedUrl.pathname.toLowerCase()
    const isLowResVariant = pathLower.includes('/thumbnail') || pathLower.includes('/preview')
    if (!isLowResVariant) return trimmedUrl

    const width = Number(parsedUrl.searchParams.get('w') || parsedUrl.searchParams.get('width') || '0')
    parsedUrl.searchParams.set('w', String(Math.max(width, 2048)))
    parsedUrl.searchParams.set('q', '90')
    parsedUrl.searchParams.delete('width')
    return trimmedUrl.startsWith('/') ? `${parsedUrl.pathname}${parsedUrl.search}` : parsedUrl.toString()
  } catch {
    return trimmedUrl
  }
}
