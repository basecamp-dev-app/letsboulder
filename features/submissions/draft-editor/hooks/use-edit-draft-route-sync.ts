'use client'

import { useCallback, useEffect, useRef } from 'react'
import { areSerializedRoutesEqual } from '@/features/route-editor/route-editor-utils'
import { haveStoredRoutesChanged } from '@/features/editor/route-store-sync'
import { csrfFetch } from '@/hooks/useCsrf'
import type { EditableRoute } from '@/features/submissions/lib/editor-types'
import type { RouteLine } from '@/features/submissions/lib/submission-types'
import type { DraftRoute } from '@/features/submissions/draft-editor/lib/edit-draft-types'

interface UseEditDraftRouteSyncParams {
  activeDraftImageId: string | null
  routeType: string
  draftIdRef: React.MutableRefObject<string>
  registerDraftUpdatedAt: (draftId: string, updatedAt: string) => void
  setAutosaveState: (value: 'idle' | 'pending' | 'saving' | 'syncing' | 'saved') => void
  setDraftUpdatedAt: (value: string | null) => void
  routeStoreRoutes: RouteLine[]
  existingRouteLines: RouteLine[]
  setRouteStoreRoutes: (routes: RouteLine[]) => void
  setRoutesByImageId: React.Dispatch<React.SetStateAction<Record<string, DraftRoute[]>>>
}

export function useEditDraftRouteSync({
  activeDraftImageId,
  routeType,
  draftIdRef,
  registerDraftUpdatedAt,
  setAutosaveState,
  setDraftUpdatedAt,
  routeStoreRoutes,
  existingRouteLines,
  setRouteStoreRoutes,
  setRoutesByImageId,
}: UseEditDraftRouteSyncParams) {
  const lastSeededRouteImageIdRef = useRef<string | null>(null)
  const skipRouteStoreSyncRef = useRef<string | null>(null)

  const scheduleDraftPersist = useCallback((nextRoutesByImageId: Record<string, DraftRoute[]>) => {
    const currentDraftId = draftIdRef.current
    if (!currentDraftId || !activeDraftImageId) return

    const currentImageRoutes = nextRoutesByImageId[activeDraftImageId] || []
    setAutosaveState('saving')
    void csrfFetch(`/api/submissions/drafts/${currentDraftId}/routes`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        draftImageId: activeDraftImageId,
        routes: currentImageRoutes.map((route, index) => ({
          id: route.id,
          name: route.name,
          grade: route.grade,
          description: route.description,
          climbType: route.climbType || routeType,
          points: route.points,
          sequenceOrder: index,
          imageWidth: route.imageWidth,
          imageHeight: route.imageHeight,
        })),
      }),
    })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({} as { result?: { updated_at?: string } }))
        if (!response.ok) {
          throw new Error('Failed to sync draft routes')
        }
        const nextUpdatedAt = payload.result?.updated_at
        if (typeof nextUpdatedAt === 'string' && nextUpdatedAt) {
          setDraftUpdatedAt(nextUpdatedAt)
          registerDraftUpdatedAt(currentDraftId, nextUpdatedAt)
        }
        setAutosaveState('saved')
      })
      .catch(() => {
        setAutosaveState('idle')
      })
  }, [activeDraftImageId, draftIdRef, registerDraftUpdatedAt, routeType, setAutosaveState, setDraftUpdatedAt])

  const handleEditRoutesUpdate = useCallback((routes: EditableRoute[]) => {
    if (!activeDraftImageId) return
    setRoutesByImageId((prev) => {
      const current = prev[activeDraftImageId] || []
      const previousById = new Map(current.map((route) => [route.id, route]))
      const mapped = routes.map((route, index) => {
        const previous = previousById.get(route.id)
        return {
          id: route.id,
          name: route.name,
          grade: route.grade || previous?.grade || '6A',
          description: route.description,
          climbType: route.climbType || previous?.climbType || routeType,
          points: route.points,
          sequenceOrder: index,
          imageWidth: previous?.imageWidth || 1200,
          imageHeight: previous?.imageHeight || 1200,
        }
      })

      if (areSerializedRoutesEqual(current, mapped)) return prev

      const nextRoutesByImageId = {
        ...prev,
        [activeDraftImageId]: mapped,
      }

      scheduleDraftPersist(nextRoutesByImageId)
      return nextRoutesByImageId
    })
  }, [activeDraftImageId, routeType, scheduleDraftPersist, setRoutesByImageId])

  const handleCanvasRoutesUpdate = useCallback((routes: RouteLine[]) => {
    setRouteStoreRoutes(routes)
    const editableRoutes = routes.map((route) => ({
      id: route.id,
      name: route.climb?.name || 'Unnamed',
      grade: route.climb?.grade || '6A',
      climbType: typeof route.climb?.route_type === 'string' ? route.climb.route_type : undefined,
      description: route.climb?.description ?? undefined,
      points: route.points,
    }))
    handleEditRoutesUpdate(editableRoutes)
  }, [handleEditRoutesUpdate, setRouteStoreRoutes])

  useEffect(() => {
    if (!activeDraftImageId) return
    if (lastSeededRouteImageIdRef.current === activeDraftImageId) return

    lastSeededRouteImageIdRef.current = activeDraftImageId
    if (haveStoredRoutesChanged(routeStoreRoutes, existingRouteLines)) {
      skipRouteStoreSyncRef.current = activeDraftImageId
      setRouteStoreRoutes(existingRouteLines)
    }
  }, [activeDraftImageId, existingRouteLines, routeStoreRoutes, setRouteStoreRoutes])

  useEffect(() => {
    if (!activeDraftImageId) return
    if (skipRouteStoreSyncRef.current === activeDraftImageId) {
      skipRouteStoreSyncRef.current = null
      return
    }
    if (!haveStoredRoutesChanged(routeStoreRoutes, existingRouteLines)) return
    handleCanvasRoutesUpdate(routeStoreRoutes)
  }, [activeDraftImageId, existingRouteLines, handleCanvasRoutesUpdate, routeStoreRoutes])

  return {
    handleCanvasRoutesUpdate,
    scheduleDraftPersist,
    skipRouteStoreSyncRef,
  }
}
