import { create } from 'zustand'
import type {
  RouteLine,
  RoutePoint,
  ZoomTransform,
  CanvasMode,
  DrawingRoute,
  InteractionTool,
} from '@/types/domain'

interface HistoryEntry {
  routes: RouteLine[]
  currentPoints: RoutePoint[]
  currentDrawing: DrawingRoute | null
}

interface RouteState {
  routes: RouteLine[]
  activeRouteId: string | null
  mode: CanvasMode
  interactionTool: InteractionTool
  zoomTransform: ZoomTransform
  currentPoints: RoutePoint[]
  currentDrawing: DrawingRoute | null

  past: HistoryEntry[]
  future: HistoryEntry[]

  setMode: (mode: CanvasMode) => void
  setInteractionTool: (tool: InteractionTool) => void
  setActiveRoute: (id: string | null) => void
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
  mode: 'browse' as CanvasMode,
  interactionTool: 'select' as InteractionTool,
  zoomTransform: { x: 0, y: 0, scale: 1 } as ZoomTransform,
  currentPoints: [] as RoutePoint[],
  currentDrawing: null as DrawingRoute | null,
  past: [] as HistoryEntry[],
  future: [] as HistoryEntry[],
}

const getHistoryEntry = (state: RouteState): HistoryEntry => ({
  routes: [...state.routes],
  currentPoints: [...state.currentPoints],
  currentDrawing: state.currentDrawing
    ? { ...state.currentDrawing, points: [...state.currentDrawing.points] }
    : null,
})

export const useRouteStore = create<RouteState>()((set, get) => ({
  ...initialState,

  setMode: (mode) => set({ mode }),

  setInteractionTool: (tool) => set({ interactionTool: tool }),

  setActiveRoute: (id) => set({ activeRouteId: id }),

  updateZoomTransform: (transform) =>
    set((state) => ({
      zoomTransform: { ...state.zoomTransform, ...transform },
    })),

  setRoutes: (routes) => set({ routes }),

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

    const newRoute: RouteLine = {
      id: `route-${Date.now()}`,
      image_id: '',
      climb_id: `climb-${Date.now()}`,
      points: [...state.currentPoints],
      color: '#dc2626',
      sequence_order: state.routes.length,
      created_at: new Date().toISOString(),
    }

    set((s) => ({
      routes: [...s.routes, newRoute],
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
    })
  },

  canUndo: () => get().past.length > 0,

  canRedo: () => get().future.length > 0,

  reset: () => set(initialState),
}))
