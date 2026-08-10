import { areSerializedRoutesEqual, serializeRouteEditorRoutes, type RouteEditorRouteInput } from '@/features/route-editor/public'
import type { RouteLine } from '@/types/domain'

export function serializeStoredRoutes(routes: RouteLine[]) {
  return serializeRouteEditorRoutes(routes.map((route): RouteEditorRouteInput => ({
    id: route.id,
    name: route.climb?.name,
    grade: route.climb?.grade,
    description: route.climb?.description,
    climbType: route.climb?.route_type,
    points: route.points,
    sequenceOrder: route.sequence_order,
    imageWidth: route.image_width,
    imageHeight: route.image_height,
  })))
}

export function haveStoredRoutesChanged(left: RouteLine[], right: RouteLine[]) {
  return !areSerializedRoutesEqual(serializeStoredRoutes(left), serializeStoredRoutes(right))
}
