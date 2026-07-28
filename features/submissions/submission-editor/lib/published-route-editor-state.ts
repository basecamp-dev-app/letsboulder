import { areSerializedRoutesEqual } from '@/features/route-editor/route-editor-utils'
import { serializeStoredRoutes } from '@/features/submissions/lib/route-store-sync'
import type { RouteLine } from '@/types/domain'

interface ServerClimbRow {
  id: string
  name: string | null
  grade: string
  status: string
  route_type: string | null
  description: string | null
}

interface ServerRouteRow {
  id: string
  climb_id: string
  points: RouteLine['points']
  sequence_order: number
  image_width: number | null
  image_height: number | null
  climbs: ServerClimbRow | ServerClimbRow[] | null
}

function pickOne<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null
  return Array.isArray(value) ? value[0] ?? null : value
}

export function normalizePublishedRoute(route: ServerRouteRow, imageId: string): RouteLine | null {
  const climb = pickOne(route.climbs)
  if (!climb || route.points.length < 2) return null

  return {
    id: route.id,
    image_id: imageId,
    climb_id: route.climb_id,
    points: route.points,
    color: 'red',
    sequence_order: route.sequence_order,
    created_at: new Date().toISOString(),
    image_width: typeof route.image_width === 'number' ? route.image_width : undefined,
    image_height: typeof route.image_height === 'number' ? route.image_height : undefined,
    climb: {
      id: climb.id,
      name: climb.name,
      grade: climb.grade,
      status: climb.status,
      route_type: climb.route_type,
      description: climb.description,
    },
  }
}

export function replaceDraftRoutesWithPublishedRoutes(currentRoutes: RouteLine[], createdRoutes: RouteLine[]) {
  const persistedRoutes = currentRoutes.filter((route) => route.climb_id && route.created_at !== 'draft-created')
  const nextRoutes = [...persistedRoutes, ...createdRoutes].sort((left, right) => left.sequence_order - right.sequence_order)
  return nextRoutes.map((route, index) => route.sequence_order === index ? route : { ...route, sequence_order: index })
}

export function applyPublishedRouteIdMappings(
  routes: RouteLine[],
  mappings: Array<{ clientRouteId: string; routeLineId: string; climbId: string }>,
  imageId: string
) {
  const mappingByClientId = new Map(mappings.map((mapping) => [mapping.clientRouteId, mapping]))
  return routes.map((route) => {
    const mapping = mappingByClientId.get(route.id)
    if (!mapping) return route
    return {
      ...route,
      id: mapping.routeLineId,
      image_id: imageId,
      climb_id: mapping.climbId,
      created_at: new Date().toISOString(),
      climb: route.climb ? { ...route.climb, id: mapping.climbId } : route.climb,
    }
  })
}

export function removePublishedRoute(routes: RouteLine[], routeLineId: string) {
  return routes
    .filter((route) => route.id !== routeLineId)
    .map((route, index) => route.sequence_order === index ? route : { ...route, sequence_order: index })
}

export function haveRouteEdits(routes: RouteLine[], initialRoutes: RouteLine[]) {
  return !areSerializedRoutesEqual(serializeStoredRoutes(routes), serializeStoredRoutes(initialRoutes))
}
