import { create } from 'zustand'
import type {
  RouteLine,
  RoutePoint,
  ZoomTransform,
  CanvasMode,
  DrawingRoute,
  InteractionTool,
} from '@/types/domain'
import type { ClimbType } from '@/lib/submission-types'

interface RouteEditorDraft {
  routeId: string | null
  name: string
  grade: string
  climbType: ClimbType
  description: string
}

type EditorIntent = 'grade' | 'name' | 'type' | 'description' | null

interface HistoryEntry {
  routes: RouteLine[]
  currentPoints: RoutePoint[]
  currentDrawing: DrawingRoute | null
  routeEditorDraft: RouteEditorDraft | null
  editorIntent: EditorIntent
  editorPanelOpen: boolean
}

interface RouteState {
  routes: RouteLine[]
  activeRouteId: string | null
  selectedRouteId: string | null
  mode: CanvasMode
  interactionTool: InteractionTool
  zoomTransform: ZoomTransform
  currentPoints: RoutePoint[]
  currentDrawing: DrawingRoute | null
  routeEditorDraft: RouteEditorDraft | null
  editorIntent: EditorIntent
  editorPanelOpen: boolean

  past: HistoryEntry[]
  future: HistoryEntry[]

  setMode: (mode: CanvasMode) => void
  setInteractionTool: (tool: InteractionTool) => void
  setActiveRoute: (id: string | null) => void
  setSelectedRoute: (id: string | null) => void
  updateZoomTransform: (transform: Partial<ZoomTransform>) => void
  setRoutes: (routes: RouteLine[]) => void
  addRoute: (route: RouteLine) => void
  updateRoute: (id: string, updates: Partial<RouteLine>) => void
  deleteRoute: (id: string) => void
  setCurrentPoints: (points: RoutePoint[]) => void
  addCurrentPoint: (point: RoutePoint) => void
  clearCurrentPoints: () => void
  undoLastPoint: () => void
  commitCurrentRoute: () => void
  setCurrentDrawing: (drawing: DrawingRoute | null) => void
  updateCurrentDrawing: (updates: Partial<DrawingRoute>) => void
  setEditorDraft: (draft: RouteEditorDraft | null) => void
  updateEditorDraft: (updates: Partial<RouteEditorDraft>) => void
  setEditorIntent: (intent: EditorIntent) => void
  setEditorPanelOpen: (open: boolean) => void
  clearCanvasState: () => void
  commitToHistory: () => void
  undo: () => void
  redo: () => void
  canUndo: () => boolean
  canRedo: () => boolean
  reset: () => void
}

const MAX_HISTORY = 50

const initialState = {
  routes: [] as RouteLine[],
  activeRouteId: null as string | null,
  selectedRouteId: null as string | null,
  mode: 'browse' as CanvasMode,
  interactionTool: 'select' as InteractionTool,
  zoomTransform: { x: 0, y: 0, scale: 1 } as ZoomTransform,
  currentPoints: [] as RoutePoint[],
  currentDrawing: null as DrawingRoute | null,
  routeEditorDraft: null as RouteEditorDraft | null,
  editorIntent: null as EditorIntent,
  editorPanelOpen: false,
  past: [] as HistoryEntry[],
  future: [] as HistoryEntry[],
}

const getHistoryEntry = (state: RouteState): HistoryEntry => ({
  routes: [...state.routes],
  currentPoints: [...state.currentPoints],
  currentDrawing: state.currentDrawing
    ? { ...state.currentDrawing, points: [...state.currentDrawing.points] }
    : null,
  routeEditorDraft: state.routeEditorDraft ? { ...state.routeEditorDraft } : null,
  editorIntent: state.editorIntent,
  editorPanelOpen: state.editorPanelOpen,
})

const areRoutePointsEqual = (left: RoutePoint[], right: RoutePoint[]) => (
  left.length === right.length && left.every((point, index) => {
    const other = right[index]
    return point.x === other?.x && point.y === other?.y
  })
)

const areRoutesEqual = (left: RouteLine[], right: RouteLine[]) => (
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

export const useRouteStore = create<RouteState>()((set, get) => ({
  ...initialState,

  setMode: (mode) => set((state) => state.mode === mode ? state : { mode }),

  setInteractionTool: (tool) => set((state) => state.interactionTool === tool ? state : { interactionTool: tool }),

  setActiveRoute: (id) => set({ activeRouteId: id }),

  setSelectedRoute: (id) => set((state) => ({
    selectedRouteId: id,
    routeEditorDraft: id && state.routeEditorDraft?.routeId === id ? state.routeEditorDraft : id ? null : null,
    editorIntent: null,
    editorPanelOpen: id ? true : state.editorPanelOpen,
  })),

  updateZoomTransform: (transform) =>
    set((state) => ({
      zoomTransform: { ...state.zoomTransform, ...transform },
    })),

  setRoutes: (routes) => set((state) => (areRoutesEqual(state.routes, routes) ? state : { routes })),

  addRoute: (route) =>
    set((state) => ({
      routes: [...state.routes, route],
    })),

  updateRoute: (id, updates) =>
    set((state) => ({
      routes: state.routes.map((r) =>
        r.id === id ? { ...r, ...updates } : r
      ),
    })),

  deleteRoute: (id) =>
    set((state) => ({
      routes: state.routes.filter((r) => r.id !== id),
      activeRouteId: state.activeRouteId === id ? null : state.activeRouteId,
      selectedRouteId: state.selectedRouteId === id ? null : state.selectedRouteId,
      routeEditorDraft: state.selectedRouteId === id ? null : state.routeEditorDraft,
      editorIntent: state.selectedRouteId === id ? null : state.editorIntent,
      editorPanelOpen: state.selectedRouteId === id ? false : state.editorPanelOpen,
    })),

  setCurrentPoints: (points) => set({ currentPoints: points }),

  addCurrentPoint: (point) =>
    set((state) => ({
      currentPoints: [...state.currentPoints, point],
    })),

  clearCurrentPoints: () => set({ currentPoints: [] }),

  undoLastPoint: () => {
    set((state) => ({
      currentPoints: state.currentPoints.slice(0, -1),
    }))
  },

  commitCurrentRoute: () => {
    const state = get()
    if (state.currentPoints.length < 2) return

    set(() => ({
      currentPoints: [],
    }))
  },

  setCurrentDrawing: (drawing) => set({ currentDrawing: drawing }),

  updateCurrentDrawing: (updates) =>
    set((state) => ({
      currentDrawing: state.currentDrawing
        ? { ...state.currentDrawing, ...updates }
        : null,
    })),

  setEditorDraft: (draft) => set({ routeEditorDraft: draft }),

  updateEditorDraft: (updates) =>
    set((state) => ({
      routeEditorDraft: state.routeEditorDraft
        ? { ...state.routeEditorDraft, ...updates }
        : null,
    })),

  setEditorIntent: (intent) => set({ editorIntent: intent }),

  setEditorPanelOpen: (open) => set({ editorPanelOpen: open }),

  clearCanvasState: () => set((state) => ({
    routes: [],
    activeRouteId: null,
    selectedRouteId: null,
    currentPoints: [],
    currentDrawing: null,
    routeEditorDraft: null,
    editorIntent: null,
    editorPanelOpen: false,
    past: [],
    future: [],
    mode: state.mode,
    interactionTool: state.interactionTool,
    zoomTransform: state.zoomTransform,
  })),

  commitToHistory: () => {
    const state = get()
    const entry = getHistoryEntry(state)
    set({
      past: [...state.past.slice(-MAX_HISTORY + 1), entry],
      future: [],
    })
  },

  undo: () => {
    const state = get()
    if (state.past.length === 0) return

    const previous = state.past[state.past.length - 1]
    const newPast = state.past.slice(0, -1)

    set({
      past: newPast,
      future: [getHistoryEntry(state), ...state.future],
      routes: previous.routes,
      currentPoints: previous.currentPoints,
      currentDrawing: previous.currentDrawing,
      routeEditorDraft: previous.routeEditorDraft,
      editorIntent: previous.editorIntent,
      editorPanelOpen: previous.editorPanelOpen,
    })
  },

  redo: () => {
    const state = get()
    if (state.future.length === 0) return

    const next = state.future[0]
    const newFuture = state.future.slice(1)

    set({
      past: [...state.past, getHistoryEntry(state)],
      future: newFuture,
      routes: next.routes,
      currentPoints: next.currentPoints,
      currentDrawing: next.currentDrawing,
      routeEditorDraft: next.routeEditorDraft,
      editorIntent: next.editorIntent,
      editorPanelOpen: next.editorPanelOpen,
    })
  },

  canUndo: () => get().past.length > 0,

  canRedo: () => get().future.length > 0,

  reset: () => set(initialState),
}))
