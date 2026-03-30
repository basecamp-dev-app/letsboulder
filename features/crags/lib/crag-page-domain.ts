import { normalizeGrade } from '@/lib/grades'
import type { Database } from '@/types/database'
import type { CragRoute } from '@/features/crags/lib/crag-page-types'
import { sortDirections } from '@/features/crags/lib/crag-geo'

export type { CachedCragImageData, OfflineCragState, OfflineHydratedCragData } from '@/features/crags/lib/crag-offline-domain'
export { formatBytes, getOfflineCragState, getStoredCragClimbPayloadsSafely, hydrateOfflineCragData } from '@/features/crags/lib/crag-offline-domain'
export { getAverageCoordinates, sortImagesByViewCenter, sortPinClusters, sortDirections } from '@/features/crags/lib/crag-geo'
export type { ActiveRouteFilterChip, CragRouteFilterState, CragRouteStats } from '@/features/crags/lib/crag-route-filters'
export {
  buildActiveRouteFilterChips,
  buildCragRouteStats,
  compareGrades,
  filterAndSortCragRoutes,
  formatRatingValue,
  formatRouteTypeLabel,
  getAvailableDirections,
  getRouteTypeChips,
  getSearchModalResults,
  normalizeRouteType,
} from '@/features/crags/lib/crag-route-filters'
export type { ClimbIdentityRow, ResolvedRouteDestination, RouteLineTargetRow, RouteTargetFetchResult } from '@/features/crags/lib/crag-route-targets'
export {
  buildEffectiveClimbLookup,
  buildRouteNavigationDisplayByClimbId,
  buildRoutePreviewDisplayByClimbId,
  buildRouteTargetMaps,
  fetchRouteTargetMapsForClimbIds,
  getHighlightedRouteIds,
  getSelectedImageIds,
  hasCompleteRouteTargets,
  mapRouteTargetsByEffectiveClimbId,
  remapRouteNavigationTargetsByEffectiveClimbId,
  remapRoutePreviewsByEffectiveClimbId,
  resolveCragRouteDestination,
} from '@/features/crags/lib/crag-route-targets'

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

export type CragRouteIntelligenceRow = Database['public']['Functions']['get_crag_route_intelligence']['Returns'][number]

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
