import type { StateCreator } from 'zustand'
import type { RouteEditorDraft, EditorIntent } from './types'
import type { RouteStoreSlice } from './canvas-slice'

export interface EditorSlice {
  routeEditorDraft: RouteEditorDraft | null
  editorIntent: EditorIntent
  editorPanelOpen: boolean
  setEditorDraft: (draft: RouteEditorDraft | null) => void
  updateEditorDraft: (updates: Partial<RouteEditorDraft>) => void
  setEditorIntent: (intent: EditorIntent) => void
  setEditorPanelOpen: (open: boolean) => void
}

export const createEditorSlice: StateCreator<RouteStoreSlice, [], [], EditorSlice> = (set) => ({
  routeEditorDraft: null,
  editorIntent: null,
  editorPanelOpen: false,

  setEditorDraft: (draft) => set({ routeEditorDraft: draft }),
  updateEditorDraft: (updates) => set((state) => {
    const draft = state.routeEditorDraft
    if (!draft) return state

    const nextDraft = { ...draft, ...updates }

    return { routeEditorDraft: nextDraft }
  }),
  setEditorIntent: (intent) => set({ editorIntent: intent }),
  setEditorPanelOpen: (open) => set({ editorPanelOpen: open }),
})
