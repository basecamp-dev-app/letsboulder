'use client'

import { useEffect, useRef } from 'react'
import { useRouteStore } from '@/features/route-editor/store'
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
  const lastParentSignatureRef = useRef('')
  const skipStoreToOwnerSyncRef = useRef(false)

  const parentSignature = JSON.stringify(serializeStoredRoutes(existingRouteLines))
  const storeSignature = JSON.stringify(serializeStoredRoutes(routeStoreRoutes))

  useEffect(() => {
    if (!activeDraftImageId) return

    const imageChanged = lastSeededImageIdRef.current !== activeDraftImageId
    const parentChanged = lastParentSignatureRef.current !== parentSignature
    if (!imageChanged && !parentChanged) return

    lastSeededImageIdRef.current = activeDraftImageId
    lastParentSignatureRef.current = parentSignature
    skipStoreToOwnerSyncRef.current = true

    clearCanvasState()
    setRoutes(existingRouteLines)
    setSelectedRoute(null)
    setActiveRoute(null)
    setEditorPanelOpen(false)
  }, [activeDraftImageId, clearCanvasState, existingRouteLines, parentSignature, setActiveRoute, setEditorPanelOpen, setRoutes, setSelectedRoute])

  useEffect(() => {
    if (!activeDraftImageId) return
    if (lastSeededImageIdRef.current !== activeDraftImageId) return

    if (skipStoreToOwnerSyncRef.current) {
      skipStoreToOwnerSyncRef.current = false
      return
    }

    if (storeSignature === parentSignature) return

    lastParentSignatureRef.current = storeSignature

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
      const currentSignature = JSON.stringify(currentRoutes)
      const nextSignature = JSON.stringify(nextRoutes)
      if (currentSignature === nextSignature) return prev

      markRoutesDirty([activeDraftImageId])
      return {
        ...prev,
        [activeDraftImageId]: nextRoutes,
      }
    })
  }, [activeDraftImageId, markRoutesDirty, parentSignature, routeStoreRoutes, routeType, setRoutesByImageId, storeSignature])
}
