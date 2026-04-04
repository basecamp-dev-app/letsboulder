/**
 * Shared climbing types used across features.
 * Extracted here to prevent circular dependencies between
 * submissions, route-editor, and grades features.
 */

export type ClimbType = 'sport' | 'boulder' | 'trad' | 'deep-water-solo'

export interface RoutePoint {
  x: number
  y: number
}
