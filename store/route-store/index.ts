import { create } from 'zustand'
import { createCanvasSlice } from './canvas-slice'
import { createEditorSlice } from './editor-slice'
import { createHistorySlice } from './history-slice'
import type { CanvasSlice } from './canvas-slice'
import type { EditorSlice } from './editor-slice'
import type { HistorySlice } from './history-slice'

export type RouteStoreSlice = CanvasSlice & EditorSlice & HistorySlice

export const useRouteStore = create<RouteStoreSlice>()((...args) => ({
  ...createCanvasSlice(...args),
  ...createEditorSlice(...args),
  ...createHistorySlice(...args),
}))
