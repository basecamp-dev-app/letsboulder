import type { RouteLine, RoutePoint, DrawingRoute } from '@/types/domain'
import type { HistoryEntry } from './types'

export const getHistoryEntry = (state: {
  routes: RouteLine[]
  currentPoints: RoutePoint[]
  currentDrawing: DrawingRoute | null
  routeEditorDraft: HistoryEntry['routeEditorDraft']
  editorIntent: HistoryEntry['editorIntent']
  editorPanelOpen: boolean
}): HistoryEntry => ({
  routes: [...state.routes],
  currentPoints: [...state.currentPoints],
  currentDrawing: state.currentDrawing
    ? { ...state.currentDrawing, points: [...state.currentDrawing.points] }
    : null,
  routeEditorDraft: state.routeEditorDraft ? { ...state.routeEditorDraft } : null,
  editorIntent: state.editorIntent,
  editorPanelOpen: state.editorPanelOpen,
})

export const areRoutePointsEqual = (left: RoutePoint[], right: RoutePoint[]) => (
  left.length === right.length && left.every((point, index) => {
    const other = right[index]
    return point.x === other?.x && point.y === other?.y
  })
)

export const areRoutesEqual = (left: RouteLine[], right: RouteLine[]) => (
  left.length === right.length && left.every((route, index) => {
    const other = right[index]
    return route.id === other?.id
      && route.image_id === other.image_id
      && route.climb_id === other.climb_id
      && route.color === other.color
      && route.sequence_order === other.sequence_order
      && route.image_width === other.image_width
      && route.image_height === other.image_height
      && areRoutePointsEqual(route.points, other.points)
  })
)
