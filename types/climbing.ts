/**
 * Shared climbing types used across features.
 * Extracted here to prevent circular dependencies between
 * submissions, route-editor, and grades features.
 */

import { ClimbRouteTypeEnum, type ClimbRouteType } from '@/lib/enums'

export type { ClimbRouteType }
export const CLIMB_ROUTE_TYPES = ClimbRouteTypeEnum.enum

export interface RoutePoint {
  x: number
  y: number
}
