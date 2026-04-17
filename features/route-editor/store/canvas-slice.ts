import type { StateCreator } from 'zustand'
import { logRouteLoop } from '@/features/route-editor/lib/debug-route-loop'
import type { RouteLine, RoutePoint, DrawingRoute } from '@/types/domain'
import type { CanvasState } from './types'
import { areRoutesEqual } from './shared'
import type { EditorSlice } from './editor-slice'
import type { HistorySlice } from './history-slice'

export interface CanvasSlice {
  routes: RouteLine[]
  activeRouteId: string | null
  selectedRouteId: string | null
  mode: CanvasState['mode']
  interactionTool: CanvasState['interactionTool']
  zoomTransform: CanvasState['zoomTransform']
  currentPoints: RoutePoint[]
  currentDrawing: DrawingRoute | null
  setMode: (mode: CanvasState['mode']) => void
  setInteractionTool: (tool: CanvasState['interactionTool']) => void
  setActiveRoute: (id: string | null) => void
  setSelectedRoute: (id: string | null) => void
  updateZoomTransform: (transform: Partial<CanvasState['zoomTransform']>) => void
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
}

export type RouteStoreSlice = CanvasSlice & EditorSlice & HistorySlice

export const createCanvasSlice: StateCreator<RouteStoreSlice, [], [], CanvasSlice> = (set, get) => ({
  routes: [],
  activeRouteId: null,
  selectedRouteId: null,
  mode: 'browse',
  interactionTool: 'select',
  zoomTransform: { x: 0, y: 0, scale: 1 },
  currentPoints: [],
  currentDrawing: null,

  setMode: (mode) => set((state) => state.mode === mode ? state : { mode }),
  setInteractionTool: (tool) => set((state) => state.interactionTool === tool ? state : { interactionTool: tool }),
  setActiveRoute: (id) => set((state) => {
    logRouteLoop('store:set-active-route', {
      previousActiveRouteId: state.activeRouteId,
      nextActiveRouteId: id,
      selectedRouteId: state.selectedRouteId,
    })
    return { activeRouteId: id }
  }),
  setSelectedRoute: (id) => set((state) => {
    logRouteLoop('store:set-selected-route', {
      previousSelectedRouteId: state.selectedRouteId,
      nextSelectedRouteId: id,
      previousDraftRouteId: state.routeEditorDraft?.routeId ?? null,
      willOpenEditorPanel: Boolean(id),
    })
    return {
      selectedRouteId: id,
      routeEditorDraft: id && state.routeEditorDraft?.routeId === id ? state.routeEditorDraft : id ? null : null,
      editorIntent: null,
      editorPanelOpen: id ? true : state.editorPanelOpen,
    }
  }),
  updateZoomTransform: (transform) => set((state) => ({ zoomTransform: { ...state.zoomTransform, ...transform } })),
  setRoutes: (routes) => set((state) => {
    const unchanged = areRoutesEqual(state.routes, routes)
    logRouteLoop('store:set-routes', {
      unchanged,
      previousRouteCount: state.routes.length,
      nextRouteCount: routes.length,
      selectedRouteId: state.selectedRouteId,
    })
    return unchanged ? state : { routes }
  }),
  addRoute: (route) => set((state) => ({ routes: [...state.routes, route] })),
  updateRoute: (id, updates) => set((state) => {
    logRouteLoop('store:update-route', {
      routeId: id,
      selectedRouteId: state.selectedRouteId,
      updateKeys: Object.keys(updates),
      climbName: typeof updates.climb?.name === 'string' ? updates.climb.name : null,
      climbGrade: typeof updates.climb?.grade === 'string' ? updates.climb.grade : null,
      climbType: typeof updates.climb?.route_type === 'string' ? updates.climb.route_type : null,
    })
    return { routes: state.routes.map((route) => route.id === id ? { ...route, ...updates } : route) }
  }),
  deleteRoute: (id) => set((state) => ({
    routes: state.routes.filter((route) => route.id !== id),
    activeRouteId: state.activeRouteId === id ? null : state.activeRouteId,
    selectedRouteId: state.selectedRouteId === id ? null : state.selectedRouteId,
    routeEditorDraft: state.selectedRouteId === id ? null : state.routeEditorDraft,
    editorIntent: state.selectedRouteId === id ? null : state.editorIntent,
    editorPanelOpen: state.selectedRouteId === id ? false : state.editorPanelOpen,
  })),
  setCurrentPoints: (points) => set({ currentPoints: points }),
  addCurrentPoint: (point) => set((state) => ({ currentPoints: [...state.currentPoints, point] })),
  clearCurrentPoints: () => set({ currentPoints: [] }),
  undoLastPoint: () => set((state) => ({ currentPoints: state.currentPoints.slice(0, -1) })),
  commitCurrentRoute: () => {
    const state = get()
    if (state.currentPoints.length < 2) return
    set(() => ({ currentPoints: [] }))
  },
  setCurrentDrawing: (drawing) => set({ currentDrawing: drawing }),
  updateCurrentDrawing: (updates) => set((state) => ({ currentDrawing: state.currentDrawing ? { ...state.currentDrawing, ...updates } : null })),
})
