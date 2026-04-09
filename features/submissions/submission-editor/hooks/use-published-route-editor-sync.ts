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
  const skipStoreToOwnerSyncRef = useRef(false)

  useEffect(() => {
    if (!activeImageId) return
    if (lastSeededImageIdRef.current === activeImageId) return

    lastSeededImageIdRef.current = activeImageId
    skipStoreToOwnerSyncRef.current = true
    clearCanvasState()
    setRoutes(editedRoutes)
    setSelectedRoute(null)
    setActiveRoute(null)
    setEditorPanelOpen(false)
  }, [activeImageId, clearCanvasState, editedRoutes, setActiveRoute, setEditorPanelOpen, setRoutes, setSelectedRoute])

  useEffect(() => {
    if (!activeImageId) return
    if (lastSeededImageIdRef.current !== activeImageId) return
    if (routeStoreRoutes.length !== 0) return
    if (editedRoutes.length === 0) return

    skipStoreToOwnerSyncRef.current = true
    setRoutes(editedRoutes)
  }, [activeImageId, editedRoutes, routeStoreRoutes.length, setRoutes])

  useEffect(() => {
    if (!activeImageId) return
    if (skipStoreToOwnerSyncRef.current) {
      skipStoreToOwnerSyncRef.current = false
      return
    }
    if (!haveStoredRoutesChanged(routeStoreRoutes, editedRoutes)) return
    setEditedRoutes(routeStoreRoutes)
  }, [activeImageId, editedRoutes, routeStoreRoutes, setEditedRoutes])

  useEffect(() => {
    if (!activeImageId) return
    if (!haveStoredRoutesChanged(routeStoreRoutes, editedRoutes)) return
    skipStoreToOwnerSyncRef.current = true
    setRoutes(editedRoutes)
  }, [activeImageId, editedRoutes, routeStoreRoutes, setRoutes])
}
