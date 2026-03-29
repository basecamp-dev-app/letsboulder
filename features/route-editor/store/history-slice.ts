import type { StateCreator } from 'zustand'
import type { RouteStoreSlice } from './canvas-slice'
import type { HistoryState } from './types'
import { MAX_HISTORY } from './types'
import { getHistoryEntry } from './shared'

export interface HistorySlice extends HistoryState {
  clearCanvasState: () => void
  commitToHistory: () => void
  undo: () => void
  redo: () => void
  canUndo: () => boolean
  canRedo: () => boolean
  reset: () => void
}

export const createHistorySlice: StateCreator<RouteStoreSlice, [], [], HistorySlice> = (set, get) => ({
  past: [],
  future: [],

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
    set({ past: [...state.past.slice(-MAX_HISTORY + 1), entry], future: [] })
  },

  undo: () => {
    const state = get()
    if (state.past.length === 0) return
    const previous = state.past[state.past.length - 1]
    set({
      past: state.past.slice(0, -1),
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
    set({
      past: [...state.past, getHistoryEntry(state)],
      future: state.future.slice(1),
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
  reset: () => set({
    routes: [],
    activeRouteId: null,
    selectedRouteId: null,
    mode: 'browse',
    interactionTool: 'select',
    zoomTransform: { x: 0, y: 0, scale: 1 },
    currentPoints: [],
    currentDrawing: null,
    routeEditorDraft: null,
    editorIntent: null,
    editorPanelOpen: false,
    past: [],
    future: [],
  }),
})
