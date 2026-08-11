'use client'

import { useCallback, useEffect, useRef } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useRouteStore, type RouteEditorDraft } from '@/features/route-editor/public'
import { areSerializedRoutesEqual } from '@/features/route-editor/public'
import type { RouteLine } from '@/types/domain'
import type { DraftRoute } from '@/features/draft-editor/lib/edit-draft-types'

interface UseEditDraftRouteStoreSyncParams {
  activeDraftImageId: string | null
  existingRouteLines: RouteLine[]
  routesByImageId: Record<string, DraftRoute[]>
  setRoutesByImageId: React.Dispatch<React.SetStateAction<Record<string, DraftRoute[]>>>
  routeType: string
  seedVersion?: string | null
}

export function useEditDraftRouteStoreSync({
  activeDraftImageId,
  existingRouteLines,
  routesByImageId,
  setRoutesByImageId,
  routeType,
  seedVersion = null,
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
  const lastSeedVersionRef = useRef<string | null>(null)
  useEffect(() => {
    if (!activeDraftImageId) return

    const seedChanged = lastSeededImageIdRef.current !== activeDraftImageId || lastSeedVersionRef.current !== seedVersion
    if (!seedChanged) return

    lastSeededImageIdRef.current = activeDraftImageId
    lastSeedVersionRef.current = seedVersion

    clearCanvasState()
    setRoutes(existingRouteLines)
    setSelectedRoute(null)
    setActiveRoute(null)
    setEditorPanelOpen(false)
  }, [activeDraftImageId, clearCanvasState, existingRouteLines, seedVersion, setActiveRoute, setEditorPanelOpen, setRoutes, setSelectedRoute])

  const commitRoutes = useCallback(() => {
    if (!activeDraftImageId || lastSeededImageIdRef.current !== activeDraftImageId) return null

    const routeMetadataById = new Map((routesByImageId[activeDraftImageId] || []).map((route) => [route.id, route]))
    const nextRoutes = routeStoreRoutes.map((route, index) => {
      const metadata = routeMetadataById.get(route.id)
      return {
      id: route.id,
      name: metadata?.name ?? route.climb?.name ?? 'Unnamed',
      grade: metadata?.grade ?? route.climb?.grade ?? '6A',
      description: metadata?.description ?? route.climb?.description ?? undefined,
      climbType: metadata?.climbType ?? (typeof route.climb?.route_type === 'string' ? route.climb.route_type : routeType),
      points: route.points,
      sequenceOrder: route.sequence_order ?? index,
      imageWidth: route.image_width || 1200,
      imageHeight: route.image_height || 1200,
      }
    })
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

  const hasLiveRouteChanges = (() => {
    if (!activeDraftImageId) return false

    const currentRoutes = routesByImageId[activeDraftImageId] || []
    return currentRoutes.length !== routeStoreRoutes.length || routeStoreRoutes.some((route, index) => {
      const stored = currentRoutes[index]
      return route.id !== stored?.id
        || (route.sequence_order ?? index) !== stored.sequenceOrder
        || (route.image_width || 1200) !== (stored.imageWidth || 1200)
        || (route.image_height || 1200) !== (stored.imageHeight || 1200)
        || route.points.length !== stored.points.length
        || route.points.some((point, pointIndex) => point.x !== stored.points[pointIndex]?.x || point.y !== stored.points[pointIndex]?.y)
    })
  })()

  const updateRouteMetadata = useCallback((routeId: string, updates: Partial<Omit<RouteEditorDraft, 'routeId'>>) => {
    if (!activeDraftImageId) return

    const committed = commitRoutes()
    setRoutesByImageId((current) => {
      const routes = current[activeDraftImageId] || committed?.routesByImageId[activeDraftImageId] || []
      return {
        ...current,
        [activeDraftImageId]: routes.map((route) => route.id === routeId
          ? {
              ...route,
              ...(updates.name !== undefined ? { name: updates.name } : {}),
              ...(updates.grade !== undefined ? { grade: updates.grade } : {}),
              ...(updates.climbType !== undefined ? { climbType: updates.climbType } : {}),
              ...(updates.description !== undefined ? { description: updates.description } : {}),
            }
          : route),
      }
    })
  }, [activeDraftImageId, commitRoutes, setRoutesByImageId])

  return { commitRoutes, hasLiveRouteChanges, updateRouteMetadata }
}
