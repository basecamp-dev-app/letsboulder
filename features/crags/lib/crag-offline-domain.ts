import { normalizeGrade } from '@/lib/grades'
import { reportError } from '@/lib/errors'
import { getStoredCragClimbPayloads } from '@/lib/offline/storage'
import type { ClimbPackResponse } from '@/features/climb/public'
import type { ImageRouteTarget } from '@/features/crags/lib/build-crag-image-destination'
import { getAverageCoordinates, sortDirections } from '@/features/crags/lib/crag-geo'
import type { CragPageCrag, CragRoute, ImageData, RouteNavigationTarget, RoutePreview } from '@/features/crags/lib/crag-page-types'

export interface OfflineHydratedCragData {
  images: ImageData[]
  routes: CragRoute[]
  routeImageIdsByClimbId: Record<string, string[]>
  routePreviewByClimbId: Record<string, RoutePreview>
  defaultRouteTargetByImageId: Record<string, ImageRouteTarget>
  routeNavigationTargetByClimbId: Record<string, RouteNavigationTarget>
  cragCenter: [number, number] | null
}

export interface CachedCragImageData {
  crag: CragPageCrag | null
  images: ImageData[]
  cragCenter: [number, number] | null
  defaultRouteTargetByImageId: Record<string, ImageRouteTarget>
  routeImageIdsByClimbId: Record<string, string[]>
  routePreviewByClimbId: Record<string, RoutePreview>
  routeNavigationTargetByClimbId: Record<string, RouteNavigationTarget>
  cachedAt: number
}

export interface OfflineCragState {
  projectedUsage: number
  overOfflineBudget: boolean
  canSaveCragOffline: boolean
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 MB'
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export async function getStoredCragClimbPayloadsSafely(cragId: string): Promise<ClimbPackResponse[]> {
  try {
    return await Promise.race([
      getStoredCragClimbPayloads(cragId),
      new Promise<ClimbPackResponse[]>((resolve) => {
        setTimeout(() => resolve([]), 1500)
      }),
    ])
  } catch (error) {
    reportError(error, {
      message: 'Failed to read stored crag climb payloads',
      level: 'warning',
      extra: { cragId },
    })
    return []
  }
}

export function hydrateOfflineCragData(payloads: ClimbPackResponse[]): OfflineHydratedCragData {
  const imageMap = new Map<string, ImageData>()
  const routeImageIdsByClimbId: Record<string, string[]> = {}
  const routePreviewByClimbId: Record<string, RoutePreview> = {}
  const defaultRouteTargetByImageId: Record<string, ImageRouteTarget> = {}
  const routeNavigationTargetByClimbId: Record<string, RouteNavigationTarget> = {}
  const routeMap = new Map<string, CragRoute>()

  const getOfflineSlug = (canonicalPath: string | undefined, climbId: string) => {
    if (!canonicalPath || canonicalPath === `/climb/${climbId}`) return null
    const parts = canonicalPath.split('/').filter(Boolean)
    return parts.length > 0 ? parts[parts.length - 1] : null
  }

  for (const payload of payloads) {
    const primaryImage = payload.primary_image
    const climb = payload.climb
    if (!primaryImage || !climb) continue

    const existingImage = imageMap.get(primaryImage.id)
    const primaryRouteCount = Array.isArray(payload.primary_route_lines) ? payload.primary_route_lines.length : 0
    const supplementaryFacesCount = Math.max(0, (payload.faces || []).filter((face) => !face.is_primary).length)

    imageMap.set(primaryImage.id, {
      id: primaryImage.id,
      url: primaryImage.url,
      latitude: existingImage?.latitude ?? primaryImage.latitude ?? null,
      longitude: existingImage?.longitude ?? primaryImage.longitude ?? null,
      route_lines_count: (existingImage?.route_lines_count || 0) + primaryRouteCount,
      is_verified: existingImage?.is_verified || false,
      verification_count: existingImage?.verification_count || 0,
      supplementary_faces_count: Math.max(existingImage?.supplementary_faces_count || 0, supplementaryFacesCount),
    })

    const firstPrimaryRoute = payload.primary_route_lines?.[0]
    if (firstPrimaryRoute && !defaultRouteTargetByImageId[primaryImage.id]) {
      defaultRouteTargetByImageId[primaryImage.id] = {
        climbId: firstPrimaryRoute.climb_id,
        routeId: firstPrimaryRoute.id,
        climbSlug: getOfflineSlug(payload.offline_pack.canonicalPath, climb.id),
        imageId: primaryImage.id,
      }
    }

    const directions = new Set<string>()
    for (const face of payload.faces || []) {
      for (const direction of face.face_directions || []) {
        if (direction) directions.add(direction)
      }
    }

    routeMap.set(climb.id, {
      id: climb.id,
      name: climb.name || 'Unnamed route',
      grade: normalizeGrade(climb.grade) || 'Unknown',
      slug: getOfflineSlug(payload.offline_pack.canonicalPath, climb.id),
      routeType: climb.route_type,
      directions: sortDirections(Array.from(directions)),
      hasTopo: true,
      topoImageCount: 1,
      ratingAvg: null,
      ratingCount: 0,
      weightedRating: null,
      sendCount: 0,
      recentSendCount60d: 0,
    })

    for (const line of payload.primary_route_lines || []) {
      const climbImageIds = routeImageIdsByClimbId[line.climb_id] || []
      if (!climbImageIds.includes(primaryImage.id)) {
        climbImageIds.push(primaryImage.id)
        routeImageIdsByClimbId[line.climb_id] = climbImageIds
      }
      if (routePreviewByClimbId[line.climb_id]) continue
      routePreviewByClimbId[line.climb_id] = {
        imageId: primaryImage.id,
        imageUrl: primaryImage.url,
      }
      routeNavigationTargetByClimbId[line.climb_id] = {
        climbId: line.climb_id,
        routeId: line.id,
        climbSlug: getOfflineSlug(payload.offline_pack.canonicalPath, line.climb_id),
        imageId: primaryImage.id,
        displayImageId: primaryImage.id,
        displayImageUrl: primaryImage.url,
      }
    }
  }

  const images = [...imageMap.values()]
  const withCoords = images.filter(
    (image): image is ImageData & { latitude: number; longitude: number } => typeof image.latitude === 'number' && typeof image.longitude === 'number'
  )

  return {
    images,
    routes: [...routeMap.values()],
    routeImageIdsByClimbId,
    routePreviewByClimbId,
    defaultRouteTargetByImageId,
    routeNavigationTargetByClimbId,
    cragCenter: withCoords.length > 0 ? getAverageCoordinates(withCoords) : null,
  }
}
