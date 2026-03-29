import type {
  RouteLine,
  RoutePoint,
  ZoomTransform,
  CanvasMode,
  DrawingRoute,
  InteractionTool,
} from '@/types/domain'
import type { ClimbType } from '@/lib/submission-types'

export interface RouteEditorDraft {
  routeId: string | null
  name: string
  grade: string
  climbType: ClimbType
  description: string
}

export type EditorIntent = 'grade' | 'name' | 'type' | 'description' | null

export interface CanvasState {
  routes: RouteLine[]
  activeRouteId: string | null
  selectedRouteId: string | null
  mode: CanvasMode
  interactionTool: InteractionTool
  zoomTransform: ZoomTransform
  currentPoints: RoutePoint[]
  currentDrawing: DrawingRoute | null
}

export interface EditorState {
  routeEditorDraft: RouteEditorDraft | null
  editorIntent: EditorIntent
  editorPanelOpen: boolean
}

export interface HistoryEntry {
  routes: RouteLine[]
  currentPoints: RoutePoint[]
  currentDrawing: DrawingRoute | null
  routeEditorDraft: RouteEditorDraft | null
  editorIntent: EditorIntent
  editorPanelOpen: boolean
}

export interface HistoryState {
  past: HistoryEntry[]
  future: HistoryEntry[]
}

export const MAX_HISTORY = 50
