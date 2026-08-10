'use client'

import { useCallback, useEffect, useRef } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useRouteStore } from '@/features/route-editor/public'
import type { RouteLine } from '@/types/domain'

interface UsePublishedRouteEditorSyncParams {
  activeImageId: string | null
  editedRoutes: RouteLine[]
  setEditedRoutes: (routes: RouteLine[]) => void
}

export function usePublishedRouteEditorSync({
  activeImageId,
  editedRoutes,
  setEditedRoutes,
}: UsePublishedRouteEditorSyncParams) {
  const {
    routes: routeStoreRoutes,
    setRoutes,
    setSelectedRoute,
    setActiveRoute,
    setEditorPanelOpen,
    clearCanvasState,
  } = useRouteStore(useShallow((state) => ({
    routes: state.routes,
    setRoutes: state.setRoutes,
    setSelectedRoute: state.setSelectedRoute,
    setActiveRoute: state.setActiveRoute,
    setEditorPanelOpen: state.setEditorPanelOpen,
    clearCanvasState: state.clearCanvasState,
  })))
  const lastSeededImageIdRef = useRef<string | null>(null)
  useEffect(() => {
    if (!activeImageId) return
    const imageChanged = lastSeededImageIdRef.current !== activeImageId
    if (!imageChanged) return

    lastSeededImageIdRef.current = activeImageId
    clearCanvasState()
    setRoutes(editedRoutes)
    setSelectedRoute(null)
    setActiveRoute(null)
    setEditorPanelOpen(false)
  }, [activeImageId, clearCanvasState, editedRoutes, setActiveRoute, setEditorPanelOpen, setRoutes, setSelectedRoute])

  const commitRoutes = useCallback(() => {
    if (!activeImageId || lastSeededImageIdRef.current !== activeImageId) return null
    setEditedRoutes(routeStoreRoutes)
    return routeStoreRoutes
  }, [activeImageId, routeStoreRoutes, setEditedRoutes])

  return { commitRoutes }
}
