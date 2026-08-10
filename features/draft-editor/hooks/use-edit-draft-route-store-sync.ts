'use client'

import { useCallback, useEffect, useRef } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useRouteStore } from '@/features/route-editor/public'
import { areSerializedRoutesEqual } from '@/features/route-editor/public'
import type { RouteLine } from '@/types/domain'
import type { DraftRoute } from '@/features/draft-editor/lib/edit-draft-types'

interface UseEditDraftRouteStoreSyncParams {
  activeDraftImageId: string | null
  existingRouteLines: RouteLine[]
  routesByImageId: Record<string, DraftRoute[]>
  setRoutesByImageId: React.Dispatch<React.SetStateAction<Record<string, DraftRoute[]>>>
  routeType: string
}

export function useEditDraftRouteStoreSync({
  activeDraftImageId,
  existingRouteLines,
  routesByImageId,
  setRoutesByImageId,
  routeType,
}: UseEditDraftRouteStoreSyncParams) {
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
    if (!activeDraftImageId) return

    const imageChanged = lastSeededImageIdRef.current !== activeDraftImageId
    if (!imageChanged) return

    lastSeededImageIdRef.current = activeDraftImageId

    clearCanvasState()
    setRoutes(existingRouteLines)
    setSelectedRoute(null)
    setActiveRoute(null)
    setEditorPanelOpen(false)
  }, [activeDraftImageId, clearCanvasState, existingRouteLines, setActiveRoute, setEditorPanelOpen, setRoutes, setSelectedRoute])

  const commitRoutes = useCallback(() => {
    if (!activeDraftImageId || lastSeededImageIdRef.current !== activeDraftImageId) return null

    const nextRoutes = routeStoreRoutes.map((route, index) => ({
      id: route.id,
      name: route.climb?.name || 'Unnamed',
      grade: route.climb?.grade || '6A',
      description: route.climb?.description ?? undefined,
      climbType: typeof route.climb?.route_type === 'string' ? route.climb.route_type : routeType,
      points: route.points,
      sequenceOrder: route.sequence_order ?? index,
      imageWidth: route.image_width || 1200,
      imageHeight: route.image_height || 1200,
    }))
    const currentRoutes = routesByImageId[activeDraftImageId] || []
    const currentSerializedRoutes = currentRoutes.map((route) => ({
      ...route,
      imageWidth: route.imageWidth || 1200,
      imageHeight: route.imageHeight || 1200,
    }))
    const nextSerializedRoutes = nextRoutes.map((route) => ({
      ...route,
      imageWidth: route.imageWidth || 1200,
      imageHeight: route.imageHeight || 1200,
    }))
    if (areSerializedRoutesEqual(currentSerializedRoutes, nextSerializedRoutes)) {
      return { changed: false, imageId: activeDraftImageId, routesByImageId }
    }

    const nextRoutesByImageId = {
      ...routesByImageId,
      [activeDraftImageId]: nextRoutes,
    }
    setRoutesByImageId(nextRoutesByImageId)
    return { changed: true, imageId: activeDraftImageId, routesByImageId: nextRoutesByImageId }
  }, [activeDraftImageId, routeStoreRoutes, routeType, routesByImageId, setRoutesByImageId])

  return { commitRoutes }
}
