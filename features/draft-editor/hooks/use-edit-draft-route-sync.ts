'use client'

import { useCallback } from 'react'
import { areSerializedRoutesEqual } from '@/features/route-editor/route-editor-utils'
import type { EditableRoute } from '@/features/submissions/lib/editor-types'
import type { RouteLine } from '@/features/submissions/lib/submission-types'
import type { DraftRoute } from '@/features/draft-editor/lib/edit-draft-types'

interface UseEditDraftRouteSyncParams {
  activeDraftImageId: string | null
  routeType: string
  setRoutesByImageId: React.Dispatch<React.SetStateAction<Record<string, DraftRoute[]>>>
  markRoutesDirty: (imageIds: string[]) => void
}

export function useEditDraftRouteSync({
  activeDraftImageId,
  routeType,
  setRoutesByImageId,
  markRoutesDirty,
}: UseEditDraftRouteSyncParams) {
  const scheduleDraftPersist = useCallback(() => {
    // Routes are persisted when the user clicks "Save draft"
  }, [])

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

      markRoutesDirty([activeDraftImageId])
      scheduleDraftPersist()
      return nextRoutesByImageId
    })
  }, [activeDraftImageId, markRoutesDirty, routeType, scheduleDraftPersist, setRoutesByImageId])

  const handleCanvasRoutesUpdate = useCallback((routes: RouteLine[]) => {
    const editableRoutes = routes.map((route) => ({
      id: route.id,
      name: route.climb?.name || 'Unnamed',
      grade: route.climb?.grade || '6A',
      climbType: typeof route.climb?.route_type === 'string' ? route.climb.route_type : undefined,
      description: route.climb?.description ?? undefined,
      points: route.points,
    }))
    handleEditRoutesUpdate(editableRoutes)
  }, [handleEditRoutesUpdate])

  return {
    handleCanvasRoutesUpdate,
    scheduleDraftPersist,
  }
}