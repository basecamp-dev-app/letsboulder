'use client'

import { useEffect, useRef } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useRouteStore } from '@/features/route-editor/store'
import { serializeStoredRoutes } from '@/features/submissions/lib/route-store-sync'
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
  const lastParentSignatureRef = useRef('')
  const skipStoreToOwnerSyncRef = useRef(false)

  const parentSignature = JSON.stringify(serializeStoredRoutes(editedRoutes))
  const storeSignature = JSON.stringify(serializeStoredRoutes(routeStoreRoutes))

  useEffect(() => {
    if (!activeImageId) return
    const imageChanged = lastSeededImageIdRef.current !== activeImageId
    const parentChanged = lastParentSignatureRef.current !== parentSignature
    if (!imageChanged && !parentChanged) return

    lastSeededImageIdRef.current = activeImageId
    lastParentSignatureRef.current = parentSignature
    skipStoreToOwnerSyncRef.current = true
    clearCanvasState()
    setRoutes(editedRoutes)
    setSelectedRoute(null)
    setActiveRoute(null)
    setEditorPanelOpen(false)
  }, [activeImageId, clearCanvasState, editedRoutes, parentSignature, setActiveRoute, setEditorPanelOpen, setRoutes, setSelectedRoute])

  useEffect(() => {
    if (!activeImageId) return
    if (lastSeededImageIdRef.current !== activeImageId) return
    if (skipStoreToOwnerSyncRef.current) {
      skipStoreToOwnerSyncRef.current = false
      return
    }
    if (storeSignature === parentSignature) return

    lastParentSignatureRef.current = storeSignature
    setEditedRoutes(routeStoreRoutes)
  }, [activeImageId, parentSignature, routeStoreRoutes, setEditedRoutes, storeSignature])
}
