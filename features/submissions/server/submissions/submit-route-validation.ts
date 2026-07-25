import { NextResponse } from 'next/server'
import { isValidGrade } from '@/lib/grade-constants'

export const VALID_ROUTE_TYPES = ['sport', 'boulder', 'trad', 'deep-water-solo'] as const
export const VALID_FACE_DIRECTIONS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const

export interface RoutePoint {
  x: number
  y: number
}

export interface NewRouteData {
  id: string
  name: string
  grade: string
  description?: string
  points: RoutePoint[]
  sequenceOrder: number
  imageWidth: number
  imageHeight: number
  imageNaturalWidth: number
  imageNaturalHeight: number
}

export interface PreparedRoute {
  name: string
  grade: string
  description: string | null
  points: RoutePoint[]
  sequenceOrder: number
  imageWidth: number
  imageHeight: number
  slug: string | null
}

export interface NewSubmissionImage {
  uploadedImageId: string
  uploadedBucket: string
  uploadedPath: string
  uploadedUrl?: string
  width: number
  height: number
  naturalWidth: number
  naturalHeight: number
  captureDate: string | null
  gpsData: {
    latitude: number
    longitude: number
  } | null
  sectorId?: string | null
}

export interface NewImageSubmission {
  mode: 'new'
  images: NewSubmissionImage[]
  primaryIndex: number
  cragId: string
  faceDirectionsByImage?: Record<string, Array<(typeof VALID_FACE_DIRECTIONS)[number]>>
  faceDirections?: Array<(typeof VALID_FACE_DIRECTIONS)[number]>
  routes: NewRouteData[]
  routeType?: (typeof VALID_ROUTE_TYPES)[number]
  sectorId?: string | null
}

export interface ExistingImageSubmission {
  mode: 'existing'
  imageId: string
  routes: NewRouteData[]
  routeType?: (typeof VALID_ROUTE_TYPES)[number]
}

export interface CragImageSubmission {
  mode: 'crag_image'
  cragImageId: string
  routes: NewRouteData[]
  routeType?: (typeof VALID_ROUTE_TYPES)[number]
}

export type SubmissionRequest = NewImageSubmission | ExistingImageSubmission | CragImageSubmission

export function normalizeRouteType(value: unknown): (typeof VALID_ROUTE_TYPES)[number] | null {
  if (typeof value !== 'string') return null
  if (!value) return null

  const normalized = value.trim().toLowerCase().replace(/_/g, '-')
  if (normalized === 'bouldering') return 'boulder'

  if (!VALID_ROUTE_TYPES.includes(normalized as (typeof VALID_ROUTE_TYPES)[number])) {
    return null
  }

  return normalized as (typeof VALID_ROUTE_TYPES)[number]
}

export function normalizeFaceDirectionsByImage(
  value: unknown,
  imageCount: number
): Record<number, Array<(typeof VALID_FACE_DIRECTIONS)[number]>> {
  const normalized: Record<number, Array<(typeof VALID_FACE_DIRECTIONS)[number]>> = {}
  if (!value || typeof value !== 'object' || Array.isArray(value)) return normalized

  for (const [rawIndex, rawDirections] of Object.entries(value)) {
    const index = Number(rawIndex)
    if (!Number.isInteger(index) || index < 0 || index >= imageCount) continue
    if (!Array.isArray(rawDirections) || rawDirections.length === 0) continue
    const unique = Array.from(new Set(rawDirections))
      .filter((direction): direction is (typeof VALID_FACE_DIRECTIONS)[number] => VALID_FACE_DIRECTIONS.includes(direction as (typeof VALID_FACE_DIRECTIONS)[number]))
    if (unique.length > 0) normalized[index] = unique
  }

  return normalized
}

export function validateAndPrepareRoutes(body: SubmissionRequest) {
  if (!Array.isArray(body.routes) || body.routes.length === 0) {
    return { error: NextResponse.json({ error: 'At least one route is required' }, { status: 400 }) }
  }

  const normalizedRouteType = normalizeRouteType(body.routeType)
  if (body.routeType !== undefined && body.routeType !== null && !normalizedRouteType) {
    return { error: NextResponse.json({ error: 'Invalid route type' }, { status: 400 }) }
  }

  const preparedRoutes: PreparedRoute[] = []
  for (const route of body.routes) {
    if (!route || typeof route !== 'object') return { error: NextResponse.json({ error: 'Invalid route payload' }, { status: 400 }) }
    if (typeof route.name !== 'string') return { error: NextResponse.json({ error: 'Route name is required' }, { status: 400 }) }

    const trimmedRouteName = route.name.trim()
    if (!trimmedRouteName) return { error: NextResponse.json({ error: 'Route name is required' }, { status: 400 }) }
    if (route.description !== undefined && route.description !== null && typeof route.description !== 'string') {
      return { error: NextResponse.json({ error: 'Route description must be a string' }, { status: 400 }) }
    }

    const trimmedDescription = typeof route.description === 'string' ? route.description.trim() : null
    if (trimmedDescription !== null && trimmedDescription.length > 500) {
      return { error: NextResponse.json({ error: 'Route description must be 500 characters or less' }, { status: 400 }) }
    }

    if (!isValidGrade(route.grade)) {
      return { error: NextResponse.json({ error: `Invalid grade: ${route.grade}` }, { status: 400 }) }
    }

    if (!Array.isArray(route.points) || route.points.length < 2) {
      return { error: NextResponse.json({ error: 'Route must have at least 2 points' }, { status: 400 }) }
    }

    if (
      typeof route.sequenceOrder !== 'number' ||
      !Number.isFinite(route.sequenceOrder) ||
      typeof route.imageWidth !== 'number' ||
      !Number.isFinite(route.imageWidth) ||
      typeof route.imageHeight !== 'number' ||
      !Number.isFinite(route.imageHeight)
    ) {
      return { error: NextResponse.json({ error: 'Route dimensions and sequenceOrder must be valid numbers' }, { status: 400 }) }
    }

    for (const point of route.points) {
      if (!point || typeof point !== 'object' || typeof point.x !== 'number' || !Number.isFinite(point.x) || typeof point.y !== 'number' || !Number.isFinite(point.y)) {
        return { error: NextResponse.json({ error: 'Route points must contain valid x/y coordinates' }, { status: 400 }) }
      }
    }

    preparedRoutes.push({
      name: trimmedRouteName,
      grade: route.grade,
      description: trimmedDescription,
      points: route.points,
      sequenceOrder: route.sequenceOrder,
      imageWidth: route.imageWidth,
      imageHeight: route.imageHeight,
      slug: null,
    })
  }

  return { preparedRoutes, normalizedRouteType }
}

export function validateNewSubmissionInput(body: SubmissionRequest) {
  let normalizedFaceDirectionsByImage: Record<number, Array<(typeof VALID_FACE_DIRECTIONS)[number]>> = {}

  if (body.mode !== 'new') {
    return { normalizedFaceDirectionsByImage, validatedNewImages: [] as NewSubmissionImage[], primaryNewImage: null as NewSubmissionImage | null }
  }

  if (!Array.isArray(body.images) || body.images.length === 0) {
    return { error: NextResponse.json({ error: 'At least one image is required' }, { status: 400 }) }
  }

  normalizedFaceDirectionsByImage = normalizeFaceDirectionsByImage(body.faceDirectionsByImage, body.images.length)
  if (Object.keys(normalizedFaceDirectionsByImage).length === 0 && Array.isArray(body.faceDirections)) {
    const legacyDirections = Array.from(new Set(body.faceDirections))
      .filter((direction): direction is (typeof VALID_FACE_DIRECTIONS)[number] => VALID_FACE_DIRECTIONS.includes(direction as (typeof VALID_FACE_DIRECTIONS)[number]))
    if (legacyDirections.length > 0 && Number.isInteger(body.primaryIndex) && body.primaryIndex >= 0 && body.primaryIndex < body.images.length) {
      normalizedFaceDirectionsByImage[body.primaryIndex] = legacyDirections
    }
  }

  if (Object.keys(normalizedFaceDirectionsByImage).length === 0) {
    return { error: NextResponse.json({ error: 'At least one face direction is required' }, { status: 400 }) }
  }

  if (!body.cragId) {
    return { error: NextResponse.json({ error: 'Crag ID is required' }, { status: 400 }) }
  }

  if (!Number.isInteger(body.primaryIndex) || body.primaryIndex < 0 || body.primaryIndex >= body.images.length) {
    return { error: NextResponse.json({ error: 'Invalid primary index' }, { status: 400 }) }
  }

  const validatedNewImages: NewSubmissionImage[] = []
  for (const image of body.images) {
    if (!image || typeof image !== 'object') return { error: NextResponse.json({ error: 'Invalid image payload' }, { status: 400 }) }
    if (!image.uploadedBucket || typeof image.uploadedBucket !== 'string') return { error: NextResponse.json({ error: 'Image uploadedBucket is required' }, { status: 400 }) }
    if (!image.uploadedPath || typeof image.uploadedPath !== 'string') return { error: NextResponse.json({ error: 'Image uploadedPath is required' }, { status: 400 }) }
    if (!Number.isFinite(image.width) || !Number.isFinite(image.height) || !Number.isFinite(image.naturalWidth) || !Number.isFinite(image.naturalHeight)) {
      return { error: NextResponse.json({ error: 'Image dimensions are required' }, { status: 400 }) }
    }
    validatedNewImages.push(image)
  }

  const primaryNewImage = validatedNewImages[body.primaryIndex]
  const allImagesHaveDirections = validatedNewImages.every((_, index) => (normalizedFaceDirectionsByImage[index] || []).length > 0)
  if (!allImagesHaveDirections) {
    return { error: NextResponse.json({ error: 'Each image must include at least one face direction' }, { status: 400 }) }
  }

  return { normalizedFaceDirectionsByImage, validatedNewImages, primaryNewImage }
}
