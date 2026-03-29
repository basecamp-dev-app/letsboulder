import { normalizeGrade } from '@/lib/grades'
import { getStoredCragClimbPayloads } from '@/lib/offline/storage'
import type { ClimbPackResponse } from '@/lib/climb/queries'
import type { ImageRouteTarget } from '@/app/crag/components/crag-image-destination'
import type { Crag, CragRoute, ImageData, RouteNavigationTarget, RoutePreview } from '@/app/crag/components/crag-page-types'
import type { Database } from '@/types/database'

export interface RawImageRow {
  id: string
  url: string
  latitude: number | null
  longitude: number | null
  created_at?: string | null
  is_verified: boolean | null
  verification_count: number | null
  route_lines: Array<{ count: number }>
}

export interface OfflineHydratedCragData {
  images: ImageData[]
  routes: CragRoute[]
  routeImageIdsByClimbId: Record<string, string[]>
  routePreviewByClimbId: Record<string, RoutePreview>
  defaultRouteTargetByImageId: Record<string, ImageRouteTarget>
  routeNavigationTargetByClimbId: Record<string, RouteNavigationTarget>
  cragCenter: [number, number] | null
}

export interface RouteLineTargetRow {
  id: string
  image_id: string
  climb_id: string
  climbs: { slug: string | null } | Array<{ slug: string | null }> | null
}

export interface ClimbIdentityRow {
  id: string
  shared_climb_id: string | null
}

export interface CachedCragImageData {
  crag: Crag | null
  images: ImageData[]
  cragCenter: [number, number] | null
  defaultRouteTargetByImageId: Record<string, ImageRouteTarget>
  routeImageIdsByClimbId: Record<string, string[]>
  routePreviewByClimbId: Record<string, RoutePreview>
  routeNavigationTargetByClimbId: Record<string, RouteNavigationTarget>
  cachedAt: number
}

export type CragRouteIntelligenceRow = Database['public']['Functions']['get_crag_route_intelligence']['Returns'][number]

const FACE_DIRECTIONS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const
const faceDirectionIndex = new Map(FACE_DIRECTIONS.map((direction, index) => [direction, index]))

export function getAverageCoordinates(images: { latitude: number; longitude: number }[]): [number, number] {
  const totalLat = images.reduce((sum, img) => sum + img.latitude, 0)
  const totalLng = images.reduce((sum, img) => sum + img.longitude, 0)
  return [totalLat / images.length, totalLng / images.length]
}

export function sortDirections(directions: string[]) {
  return [...new Set(directions.filter(Boolean))].sort((a, b) => {
    const aIndex = faceDirectionIndex.get(a as typeof FACE_DIRECTIONS[number])
    const bIndex = faceDirectionIndex.get(b as typeof FACE_DIRECTIONS[number])
    if (aIndex === undefined && bIndex === undefined) return a.localeCompare(b)
    if (aIndex === undefined) return 1
    if (bIndex === undefined) return -1
    return aIndex - bIndex
  })
}

export function formatCragRoutes(rows: CragRouteIntelligenceRow[] | null | undefined): CragRoute[] {
  if (!rows || rows.length === 0) return []
  return rows.map((route) => ({
    id: route.id,
    name: (route.name || '').trim() || 'Unnamed route',
    grade: normalizeGrade(route.grade) || 'Unknown',
    slug: route.slug,
    routeType: route.route_type,
    directions: sortDirections(route.directions || []),
    hasTopo: Boolean(route.has_topo),
    topoImageCount: typeof route.topo_image_count === 'number' ? route.topo_image_count : 0,
    ratingAvg: typeof route.rating_avg === 'number' ? route.rating_avg : null,
    ratingCount: typeof route.rating_count === 'number' ? route.rating_count : 0,
    weightedRating: typeof route.weighted_rating === 'number' ? route.weighted_rating : null,
    sendCount: typeof route.send_count === 'number' ? route.send_count : 0,
    recentSendCount60d: typeof route.recent_send_count_60d === 'number' ? route.recent_send_count_60d : 0,
  }))
}

export function dedupeCragRoutes(routes: CragRoute[], effectiveClimbIdByClimbId: Record<string, string>) {
  const groupedRoutes = new Map<string, CragRoute>()
  for (const route of routes) {
    const effectiveClimbId = effectiveClimbIdByClimbId[route.id] || route.id
    const existing = groupedRoutes.get(effectiveClimbId)
    if (!existing) {
      groupedRoutes.set(effectiveClimbId, { ...route, id: effectiveClimbId })
      continue
    }
    const isCanonicalRoute = route.id === effectiveClimbId
    groupedRoutes.set(effectiveClimbId, {
      ...existing,
      id: effectiveClimbId,
      name: isCanonicalRoute ? route.name : existing.name,
      grade: isCanonicalRoute ? route.grade : existing.grade,
      slug: isCanonicalRoute ? route.slug : (existing.slug || route.slug),
      routeType: existing.routeType || route.routeType,
      directions: sortDirections([...existing.directions, ...route.directions]),
      hasTopo: existing.hasTopo || route.hasTopo,
      topoImageCount: Math.max(existing.topoImageCount, route.topoImageCount),
      ratingAvg: existing.ratingAvg ?? route.ratingAvg,
      ratingCount: Math.max(existing.ratingCount, route.ratingCount),
      weightedRating: existing.weightedRating ?? route.weightedRating,
      sendCount: Math.max(existing.sendCount, route.sendCount),
      recentSendCount60d: Math.max(existing.recentSendCount60d, route.recentSendCount60d),
    })
  }
  return [...groupedRoutes.values()]
}

export function remapRoutePreviewsByEffectiveClimbId(
  routePreviewByClimbId: Record<string, RoutePreview>,
  effectiveClimbIdByClimbId: Record<string, string>
) {
  const nextPreviewByClimbId: Record<string, RoutePreview> = {}
  for (const [climbId, preview] of Object.entries(routePreviewByClimbId)) {
    const effectiveClimbId = effectiveClimbIdByClimbId[climbId] || climbId
    if (!nextPreviewByClimbId[effectiveClimbId]) {
      nextPreviewByClimbId[effectiveClimbId] = preview
    }
  }
  return nextPreviewByClimbId
}

export function buildEffectiveClimbLookup(rows: ClimbIdentityRow[]) {
  const effectiveClimbIdByClimbId = Object.fromEntries(rows.map((row) => [row.id, row.shared_climb_id || row.id]))
  const climbIdsByEffectiveClimbId = rows.reduce<Record<string, string[]>>((acc, row) => {
    const effectiveClimbId = row.shared_climb_id || row.id
    const existing = acc[effectiveClimbId] || []
    existing.push(row.id)
    acc[effectiveClimbId] = existing
    return acc
  }, {})
  return { effectiveClimbIdByClimbId, climbIdsByEffectiveClimbId }
}

export function mapRouteTargetsByEffectiveClimbId(
  routeTargetsData: RouteLineTargetRow[],
  imageById: Map<string, ImageData>,
  effectiveClimbIdByClimbId: Record<string, string>,
  selectableImageIdByImageId: Record<string, string> = {}
) {
  const nextRoutePreviewByClimbId: Record<string, RoutePreview> = {}
  const nextRouteNavigationTargetByClimbId: Record<string, RouteNavigationTarget> = {}
  for (const row of routeTargetsData) {
    const effectiveClimbId = effectiveClimbIdByClimbId[row.climb_id] || row.climb_id
    if (nextRouteNavigationTargetByClimbId[effectiveClimbId]) continue
    const selectableImageId = selectableImageIdByImageId[row.image_id] || row.image_id
    const image = imageById.get(selectableImageId)
    if (!image) continue
    const climb = Array.isArray(row.climbs) ? row.climbs[0] : row.climbs
    nextRoutePreviewByClimbId[effectiveClimbId] = { imageId: selectableImageId, imageUrl: image.url }
    nextRouteNavigationTargetByClimbId[effectiveClimbId] = {
      climbId: effectiveClimbId,
      routeId: row.id,
      climbSlug: climb?.slug || null,
      imageId: selectableImageId,
      displayImageId: selectableImageId,
      displayImageUrl: image.url,
    }
  }
  return { nextRoutePreviewByClimbId, nextRouteNavigationTargetByClimbId }
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
    console.warn('Failed to read stored crag climb payloads:', { cragId, error })
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
