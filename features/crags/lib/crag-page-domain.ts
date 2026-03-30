import { GRADES, normalizeGrade } from '@/lib/grades'
import { getStoredCragClimbPayloads } from '@/lib/offline/storage'
import type { ClimbPackResponse } from '@/lib/climb/queries'
import type { ImageRouteTarget } from '@/features/crags/lib/build-crag-image-destination'
import type { Crag, CragRoute, ImageData, RouteNavigationTarget, RoutePreview } from '@/features/crags/lib/crag-page-types'
import type { Database } from '@/types/database'
import type { ClusterableCragImage, CragPinCluster } from '@/lib/crag-pin-clusters'

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
const gradeOrderIndex = new Map(GRADES.map((grade, index) => [grade, index]))

function toRad(deg: number) {
  return (deg * Math.PI) / 180
}

function bearingDegrees(from: [number, number], to: [number, number]) {
  const [lat1, lon1] = from.map(toRad)
  const [lat2, lon2] = to.map(toRad)
  const dLon = lon2 - lon1
  const y = Math.sin(dLon) * Math.cos(lat2)
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon)
  const brng = (Math.atan2(y, x) * 180) / Math.PI
  return (brng + 360) % 360
}

function haversineMeters(from: [number, number], to: [number, number]) {
  const R = 6371000
  const [lat1, lon1] = from.map(toRad)
  const [lat2, lon2] = to.map(toRad)
  const dLat = lat2 - lat1
  const dLon = lon2 - lon1
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

function getGradeIndex(grade: string) {
  return gradeOrderIndex.get(grade)
}

export function compareGrades(a: string, b: string) {
  const aIndex = getGradeIndex(a)
  const bIndex = getGradeIndex(b)
  if (aIndex === undefined && bIndex === undefined) return a.localeCompare(b)
  if (aIndex === undefined) return 1
  if (bIndex === undefined) return -1
  return aIndex - bIndex
}

export function normalizeRouteType(value: string): string {
  return value.trim().toLowerCase().replace(/_/g, '-')
}

export function formatRouteTypeLabel(value: string): string {
  return normalizeRouteType(value)
    .split('-')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

export function formatRatingValue(value: number | null) {
  return value === null ? 'Unrated' : value.toFixed(1)
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 MB'
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function getAvailableDirections(routes: CragRoute[]) {
  const seen = new Set<string>()
  for (const route of routes) {
    if (route.directions.length === 0) {
      seen.add('Unknown')
      continue
    }

    for (const direction of route.directions) {
      seen.add(direction)
    }
  }

  return [...seen].sort((a, b) => {
    if (a === 'Unknown' && b !== 'Unknown') return 1
    if (a !== 'Unknown' && b === 'Unknown') return -1
    const aIndex = faceDirectionIndex.get(a as typeof FACE_DIRECTIONS[number])
    const bIndex = faceDirectionIndex.get(b as typeof FACE_DIRECTIONS[number])
    if (aIndex === undefined && bIndex === undefined) return a.localeCompare(b)
    if (aIndex === undefined) return 1
    if (bIndex === undefined) return -1
    return aIndex - bIndex
  })
}

export function getRouteTypeChips(routes: CragRoute[]) {
  const uniqueTypes = new Set<string>()
  for (const route of routes) {
    if (!route.routeType) continue
    uniqueTypes.add(normalizeRouteType(route.routeType))
  }

  return [...uniqueTypes].sort((a, b) => a.localeCompare(b))
}

export interface CragRouteFilterState {
  selectedImageId: string | null
  minGrade: string
  maxGrade: string
  minRating: string
  minSends: string
  searchQuery: string
  selectedDirections: string[]
  selectedRouteTypes: string[]
  topoOnly: boolean
}

export function filterAndSortCragRoutes(
  routes: CragRoute[],
  highlightedRouteIds: Set<string>,
  routeSort: 'sends' | 'rating' | 'grade' | 'name',
  filterState: CragRouteFilterState,
) {
  const minIndex = filterState.minGrade ? getGradeIndex(filterState.minGrade) : undefined
  const maxIndex = filterState.maxGrade ? getGradeIndex(filterState.maxGrade) : undefined
  const normalizedSearchQuery = filterState.searchQuery.trim().toLowerCase()
  const minimumRating = filterState.minRating ? Number(filterState.minRating) : null
  const minimumSends = filterState.minSends ? Number(filterState.minSends) : null

  return routes
    .filter((route) => {
      if (filterState.selectedImageId && !highlightedRouteIds.has(route.id)) return false

      const routeGradeIndex = getGradeIndex(route.grade)
      if (minIndex !== undefined) {
        if (routeGradeIndex === undefined || routeGradeIndex < minIndex) return false
      }
      if (maxIndex !== undefined) {
        if (routeGradeIndex === undefined || routeGradeIndex > maxIndex) return false
      }

      if (filterState.selectedDirections.length > 0) {
        const routeDirections = route.directions.length > 0 ? route.directions : ['Unknown']
        if (!routeDirections.some((direction) => filterState.selectedDirections.includes(direction))) return false
      }

      if (filterState.selectedRouteTypes.length > 0) {
        const normalizedRouteType = route.routeType ? normalizeRouteType(route.routeType) : ''
        if (!normalizedRouteType || !filterState.selectedRouteTypes.includes(normalizedRouteType)) return false
      }

      if (filterState.topoOnly && !route.hasTopo) return false
      if (minimumRating !== null && (route.weightedRating === null || route.weightedRating < minimumRating)) return false
      if (minimumSends !== null && route.sendCount < minimumSends) return false

      if (normalizedSearchQuery.length > 0) {
        const searchable = `${route.name} ${route.grade} ${route.routeType || ''}`.toLowerCase()
        if (!searchable.includes(normalizedSearchQuery)) return false
      }

      return true
    })
    .sort((a, b) => {
      if (routeSort === 'sends') {
        const aHighlighted = highlightedRouteIds.has(a.id)
        const bHighlighted = highlightedRouteIds.has(b.id)
        if (aHighlighted !== bHighlighted) return aHighlighted ? -1 : 1
        if (a.sendCount !== b.sendCount) return b.sendCount - a.sendCount
        if ((a.weightedRating ?? -1) !== (b.weightedRating ?? -1)) return (b.weightedRating ?? -1) - (a.weightedRating ?? -1)
        const gradeCompare = compareGrades(a.grade, b.grade)
        if (gradeCompare !== 0) return gradeCompare
        return a.name.localeCompare(b.name)
      }

      if (routeSort === 'rating') {
        const aHighlighted = highlightedRouteIds.has(a.id)
        const bHighlighted = highlightedRouteIds.has(b.id)
        if (aHighlighted !== bHighlighted) return aHighlighted ? -1 : 1
        if (a.weightedRating === null && b.weightedRating !== null) return 1
        if (a.weightedRating !== null && b.weightedRating === null) return -1
        if (a.weightedRating !== null && b.weightedRating !== null && a.weightedRating !== b.weightedRating) {
          return b.weightedRating - a.weightedRating
        }
        if (a.ratingCount !== b.ratingCount) return b.ratingCount - a.ratingCount
        if (a.sendCount !== b.sendCount) return b.sendCount - a.sendCount
        return a.name.localeCompare(b.name)
      }

      if (routeSort === 'name') {
        const aHighlighted = highlightedRouteIds.has(a.id)
        const bHighlighted = highlightedRouteIds.has(b.id)
        if (aHighlighted !== bHighlighted) return aHighlighted ? -1 : 1
        return a.name.localeCompare(b.name)
      }

      const aHighlighted = highlightedRouteIds.has(a.id)
      const bHighlighted = highlightedRouteIds.has(b.id)
      if (aHighlighted !== bHighlighted) return aHighlighted ? -1 : 1
      const gradeCompare = compareGrades(a.grade, b.grade)
      if (gradeCompare !== 0) return gradeCompare
      if (a.sendCount !== b.sendCount) return b.sendCount - a.sendCount
      return a.name.localeCompare(b.name)
    })
}

export interface CragRouteStats {
  totalRoutes: number
  totalSendsAcrossRoutes: number
  averageRating: number | null
  mostCommonGrade: { grade: string; count: number } | null
  medianGrade: string | null
  routeTypeMix: Array<{ routeType: string; count: number }>
  gradeDistribution: Array<{ grade: string; count: number }>
  sendsByGrade: Array<{ grade: string; sends: number }>
  topoCoverageCount: number
  ratedRoutesCount: number
}

export function buildCragRouteStats(routes: CragRoute[]): CragRouteStats {
  const gradeCounts = new Map<string, number>()
  const sendsByGradeMap = new Map<string, number>()
  const routeTypeCounts = new Map<string, number>()
  let totalSendsAcrossRoutes = 0
  let ratingsWeightedTotal = 0
  let ratingsCountTotal = 0

  for (const route of routes) {
    gradeCounts.set(route.grade, (gradeCounts.get(route.grade) || 0) + 1)
    sendsByGradeMap.set(route.grade, (sendsByGradeMap.get(route.grade) || 0) + route.sendCount)
    totalSendsAcrossRoutes += route.sendCount

    if (route.routeType) {
      const normalizedRouteType = normalizeRouteType(route.routeType)
      routeTypeCounts.set(normalizedRouteType, (routeTypeCounts.get(normalizedRouteType) || 0) + 1)
    }

    if (route.ratingAvg !== null && route.ratingCount > 0) {
      ratingsWeightedTotal += route.ratingAvg * route.ratingCount
      ratingsCountTotal += route.ratingCount
    }
  }

  const gradeDistribution = Array.from(gradeCounts.entries())
    .map(([grade, count]) => ({ grade, count }))
    .sort((a, b) => compareGrades(a.grade, b.grade))

  const sendsByGrade = Array.from(sendsByGradeMap.entries())
    .map(([grade, sends]) => ({ grade, sends }))
    .sort((a, b) => compareGrades(a.grade, b.grade))

  const sortedByGrade = [...routes].sort((a, b) => compareGrades(a.grade, b.grade))
  const medianRoute = sortedByGrade.length > 0 ? sortedByGrade[Math.floor((sortedByGrade.length - 1) / 2)] : null
  const mostCommonGrade = gradeDistribution.reduce<{ grade: string; count: number } | null>((best, current) => {
    if (!best || current.count > best.count) return current
    return best
  }, null)

  const routeTypeMix = Array.from(routeTypeCounts.entries())
    .map(([routeType, count]) => ({ routeType, count }))
    .sort((a, b) => b.count - a.count || a.routeType.localeCompare(b.routeType))

  return {
    totalRoutes: routes.length,
    totalSendsAcrossRoutes,
    averageRating: ratingsCountTotal > 0 ? ratingsWeightedTotal / ratingsCountTotal : null,
    mostCommonGrade,
    medianGrade: medianRoute?.grade || null,
    routeTypeMix,
    gradeDistribution,
    sendsByGrade,
    topoCoverageCount: routes.filter((route) => route.hasTopo).length,
    ratedRoutesCount: routes.filter((route) => route.ratingCount > 0).length,
  }
}

export function getSearchModalResults(routes: CragRoute[], searchQuery: string) {
  const query = searchQuery.trim().toLowerCase()
  if (!query) return [] as CragRoute[]
  return routes.filter((route) => `${route.name} ${route.grade} ${route.routeType || ''}`.toLowerCase().includes(query)).slice(0, 12)
}

export function buildRoutePreviewDisplayByClimbId(
  routePreviewByClimbId: Record<string, RoutePreview>,
  imageById: Map<string, ImageData>
) {
  const nextPreviews: Record<string, RoutePreview> = {}

  for (const [climbId, preview] of Object.entries(routePreviewByClimbId)) {
    const image = imageById.get(preview.imageId)
    nextPreviews[climbId] = {
      imageId: image?.id || preview.imageId,
      imageUrl: image?.url || preview.imageUrl,
    }
  }

  return nextPreviews
}

export function buildRouteNavigationDisplayByClimbId(
  routeNavigationTargetByClimbId: Record<string, RouteNavigationTarget>,
  imageById: Map<string, ImageData>
) {
  const nextTargets: Record<string, RouteNavigationTarget> = {}

  for (const [climbId, target] of Object.entries(routeNavigationTargetByClimbId)) {
    const displayImage = imageById.get(target.displayImageId)

    nextTargets[climbId] = {
      ...target,
      displayImageId: target.displayImageId,
      displayImageUrl: displayImage?.url || target.displayImageUrl,
    }
  }

  return nextTargets
}

export function sortImagesByViewCenter(images: ImageData[], viewCenter: [number, number] | null) {
  if (!viewCenter) return images

  const withGeo = images
    .map((img) => {
      if (img.latitude == null || img.longitude == null) return null
      const pos: [number, number] = [img.latitude, img.longitude]
      return {
        img,
        bearing: bearingDegrees(viewCenter, pos),
        dist: haversineMeters(viewCenter, pos),
      }
    })
    .filter((value): value is { img: ImageData; bearing: number; dist: number } => value !== null)

  withGeo.sort((a, b) => {
    if (a.bearing !== b.bearing) return a.bearing - b.bearing
    return a.dist - b.dist
  })

  const sorted = withGeo.map((x) => x.img)
  const missing = images.filter((img) => img.latitude == null || img.longitude == null)
  return [...sorted, ...missing]
}

export function sortPinClusters<TImage extends ClusterableCragImage>(
  clusters: Array<CragPinCluster<TImage> & { badgeNumber: number }>,
  center: [number, number] | null
) {
  const sortable = [...clusters]

  sortable.sort((a, b) => {
    if (center) {
      const aBearing = bearingDegrees(center, [a.latitude, a.longitude])
      const bBearing = bearingDegrees(center, [b.latitude, b.longitude])
      if (aBearing !== bBearing) return aBearing - bBearing

      const aDistance = haversineMeters(center, [a.latitude, a.longitude])
      const bDistance = haversineMeters(center, [b.latitude, b.longitude])
      if (aDistance !== bDistance) return aDistance - bDistance
    }

    if (a.latitude !== b.latitude) return b.latitude - a.latitude
    if (a.longitude !== b.longitude) return a.longitude - b.longitude
    return a.id.localeCompare(b.id)
  })

  return sortable.map((cluster, index) => ({
    ...cluster,
    badgeNumber: index + 1,
  }))
}

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
