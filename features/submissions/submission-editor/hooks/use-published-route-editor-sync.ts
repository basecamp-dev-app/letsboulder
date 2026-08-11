'use client'

import { useCallback, useEffect, useRef } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useRouteStore, type RouteEditorDraft } from '@/features/route-editor/public'
import type { RouteLine } from '@/types/domain'

interface UsePublishedRouteEditorSyncParams {
  activeImageId: string | null
  loadedImageId: string | null
  editedRoutes: RouteLine[]
  setEditedRoutes: (routes: RouteLine[]) => void
}

export function usePublishedRouteEditorSync({
  activeImageId,
  loadedImageId,
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
    if (!activeImageId || loadedImageId !== activeImageId) return
    const imageChanged = lastSeededImageIdRef.current !== activeImageId
    if (!imageChanged) return

    lastSeededImageIdRef.current = activeImageId
    clearCanvasState()
    setRoutes(editedRoutes)
    setSelectedRoute(null)
    setActiveRoute(null)
    setEditorPanelOpen(false)
  }, [activeImageId, clearCanvasState, editedRoutes, loadedImageId, setActiveRoute, setEditorPanelOpen, setRoutes, setSelectedRoute])

  const commitRoutes = useCallback(() => {
    if (!activeImageId || lastSeededImageIdRef.current !== activeImageId) return null
    const metadataById = new Map(editedRoutes.map((route) => [route.id, route.climb]))
    const nextRoutes = routeStoreRoutes.map((route) => ({
      ...route,
      climb: metadataById.get(route.id) ?? route.climb,
    }))
    setEditedRoutes(nextRoutes)
    return nextRoutes
  }, [activeImageId, editedRoutes, routeStoreRoutes, setEditedRoutes])

  const updateRouteMetadata = useCallback((routeId: string, updates: Partial<Omit<RouteEditorDraft, 'routeId'>>) => {
    const committedRoutes = commitRoutes() ?? editedRoutes
    setEditedRoutes(committedRoutes.map((route) => route.id === routeId
      ? {
          ...route,
          climb: route.climb ? {
            ...route.climb,
            ...(updates.name !== undefined ? { name: updates.name } : {}),
            ...(updates.grade !== undefined ? { grade: updates.grade } : {}),
            ...(updates.climbType !== undefined ? { route_type: updates.climbType } : {}),
            ...(updates.description !== undefined ? { description: updates.description } : {}),
          } : route.climb,
        }
      : route))
  }, [commitRoutes, editedRoutes, setEditedRoutes])

  return { commitRoutes, updateRouteMetadata }
}
