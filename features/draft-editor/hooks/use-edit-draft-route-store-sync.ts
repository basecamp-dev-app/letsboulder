'use client'

import { useEffect, useMemo, useRef } from 'react'
import { logRouteLoop } from '@/features/route-editor/lib/debug-route-loop'
import { useRouteStore } from '@/features/route-editor/store'
import { areSerializedRoutesEqual, type RouteEditorSerializableRoute } from '@/features/route-editor/route-editor-utils'
import { serializeStoredRoutes } from '@/features/submissions/lib/route-store-sync'
import type { RouteLine } from '@/types/domain'
import type { DraftRoute } from '@/features/draft-editor/lib/edit-draft-types'

interface UseEditDraftRouteStoreSyncParams {
  activeDraftImageId: string | null
  existingRouteLines: RouteLine[]
  setRoutesByImageId: React.Dispatch<React.SetStateAction<Record<string, DraftRoute[]>>>
  routeType: string
  markRoutesDirty: (imageIds: string[]) => void
}

export function useEditDraftRouteStoreSync({
  activeDraftImageId,
  existingRouteLines,
  setRoutesByImageId,
  routeType,
  markRoutesDirty,
}: UseEditDraftRouteStoreSyncParams) {
  const {
    routes: routeStoreRoutes,
    setRoutes,
    setSelectedRoute,
    setActiveRoute,
    setEditorPanelOpen,
    clearCanvasState,
  } = useRouteStore()

  const lastSeededImageIdRef = useRef<string | null>(null)
  const lastAppliedParentRoutesRef = useRef<RouteEditorSerializableRoute[]>([])
  const lastPushedStoreRoutesRef = useRef<RouteEditorSerializableRoute[]>([])

  const parentRoutes = useMemo(() => serializeStoredRoutes(existingRouteLines), [existingRouteLines])
  const storeRoutes = useMemo(() => serializeStoredRoutes(routeStoreRoutes), [routeStoreRoutes])

  useEffect(() => {
    if (!activeDraftImageId) return

    const imageChanged = lastSeededImageIdRef.current !== activeDraftImageId
    if (!imageChanged) return

    logRouteLoop('draft-sync:image-switch-seed', {
      activeDraftImageId,
      parentRouteCount: parentRoutes.length,
      storeRouteCount: storeRoutes.length,
    })

    lastSeededImageIdRef.current = activeDraftImageId
    lastAppliedParentRoutesRef.current = parentRoutes
    lastPushedStoreRoutesRef.current = parentRoutes

    clearCanvasState()
    setRoutes(existingRouteLines)
    setSelectedRoute(null)
    setActiveRoute(null)
    setEditorPanelOpen(false)
  }, [activeDraftImageId, clearCanvasState, existingRouteLines, parentRoutes, setActiveRoute, setEditorPanelOpen, setRoutes, setSelectedRoute, storeRoutes.length])

  useEffect(() => {
    if (!activeDraftImageId) return
    if (lastSeededImageIdRef.current !== activeDraftImageId) return
    if (areSerializedRoutesEqual(parentRoutes, lastAppliedParentRoutesRef.current)) return
    if (areSerializedRoutesEqual(parentRoutes, lastPushedStoreRoutesRef.current)) {
      logRouteLoop('draft-sync:skip-parent-reseed-from-store', {
        activeDraftImageId,
        parentRouteCount: parentRoutes.length,
      })
      lastAppliedParentRoutesRef.current = parentRoutes
      return
    }

    logRouteLoop('draft-sync:parent-to-store', {
      activeDraftImageId,
      parentRouteCount: parentRoutes.length,
      storeRouteCount: storeRoutes.length,
    })
    lastAppliedParentRoutesRef.current = parentRoutes
    lastPushedStoreRoutesRef.current = parentRoutes
    setRoutes(existingRouteLines)
  }, [activeDraftImageId, existingRouteLines, parentRoutes, setRoutes, storeRoutes.length])

  useEffect(() => {
    if (!activeDraftImageId) return
    if (lastSeededImageIdRef.current !== activeDraftImageId) return
    if (areSerializedRoutesEqual(storeRoutes, parentRoutes)) return
    if (areSerializedRoutesEqual(storeRoutes, lastPushedStoreRoutesRef.current)) return

    logRouteLoop('draft-sync:store-to-owner', {
      activeDraftImageId,
      parentRouteCount: parentRoutes.length,
      storeRouteCount: storeRoutes.length,
    })

    lastPushedStoreRoutesRef.current = storeRoutes

    setRoutesByImageId((prev) => {
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

      const currentRoutes = prev[activeDraftImageId] || []
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
      if (areSerializedRoutesEqual(currentSerializedRoutes, nextSerializedRoutes)) return prev

      markRoutesDirty([activeDraftImageId])
      return {
        ...prev,
        [activeDraftImageId]: nextRoutes,
      }
    })
  }, [activeDraftImageId, markRoutesDirty, parentRoutes, routeStoreRoutes, routeType, setRoutesByImageId, storeRoutes])
}
