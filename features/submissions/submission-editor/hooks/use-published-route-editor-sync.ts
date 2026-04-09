'use client'

import { useEffect, useRef } from 'react'
import { useRouteStore } from '@/features/route-editor/store'
import { haveStoredRoutesChanged } from '@/features/submissions/lib/route-store-sync'
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
  } = useRouteStore()
  const lastSeededImageIdRef = useRef<string | null>(null)

  useEffect(() => {
    if (!activeImageId) return
    if (lastSeededImageIdRef.current === activeImageId) return

    lastSeededImageIdRef.current = activeImageId
    clearCanvasState()
    setRoutes(editedRoutes)
    setSelectedRoute(null)
    setActiveRoute(null)
    setEditorPanelOpen(false)
  }, [activeImageId, clearCanvasState, editedRoutes, setActiveRoute, setEditorPanelOpen, setRoutes, setSelectedRoute])

  useEffect(() => {
    if (!activeImageId) return
    if (lastSeededImageIdRef.current !== activeImageId) return
    if (!haveStoredRoutesChanged(routeStoreRoutes, editedRoutes)) return

    setEditedRoutes(routeStoreRoutes)
  }, [activeImageId, editedRoutes, routeStoreRoutes, setEditedRoutes])
}
