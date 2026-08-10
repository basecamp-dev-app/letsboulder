'use client'

import { MouseEvent, useCallback, useState } from 'react'
import type { EditableRoute, FloorPlan } from '../types/gym-admin-types'

interface UseGymAdminCanvasParams {
  activeFloorPlan: FloorPlan | null
  routes: EditableRoute[]
  setRoutes: React.Dispatch<React.SetStateAction<EditableRoute[]>>
}

interface UseGymAdminCanvasReturn {
  markerTargetId: string | null
  setMarkerTargetId: React.Dispatch<React.SetStateAction<string | null>>
  handleCanvasClick: (event: MouseEvent<HTMLDivElement>) => void
  updateRoute: (routeId: string, patch: Partial<EditableRoute>) => void
  removeRoute: (routeId: string) => void
}

export function useGymAdminCanvas({
  activeFloorPlan,
  setRoutes,
}: UseGymAdminCanvasParams): UseGymAdminCanvasReturn {
  const [markerTargetId, setMarkerTargetId] = useState<string | null>(null)

  const addRouteAtMarker = useCallback((xNorm: number, yNorm: number) => {
    if (!activeFloorPlan) return
    const id = `tmp-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`
    setRoutes(current => [
      ...current,
      {
        id,
        persistedId: null,
        floor_plan_id: activeFloorPlan.id,
        name: '',
        grade: '',
        discipline: 'boulder',
        color: '',
        setter_name: '',
        status: 'active',
        marker: { x_norm: xNorm, y_norm: yNorm },
      },
    ])
  }, [activeFloorPlan, setRoutes])

  const handleCanvasClick = useCallback((event: MouseEvent<HTMLDivElement>) => {
    if (!activeFloorPlan) return

    const rect = event.currentTarget.getBoundingClientRect()
    const xNorm = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width))
    const yNorm = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height))

    if (markerTargetId) {
      setRoutes(current => current.map(route => route.id === markerTargetId
        ? { ...route, marker: { x_norm: xNorm, y_norm: yNorm } }
        : route))
      setMarkerTargetId(null)
      return
    }

    addRouteAtMarker(xNorm, yNorm)
  }, [activeFloorPlan, markerTargetId, addRouteAtMarker, setRoutes])

  const updateRoute = useCallback((routeId: string, patch: Partial<EditableRoute>) => {
    setRoutes(current => current.map(route => route.id === routeId ? { ...route, ...patch } : route))
  }, [setRoutes])

  const removeRoute = useCallback((routeId: string) => {
    setRoutes(current => current.filter(route => route.id !== routeId))
  }, [setRoutes])

  return {
    markerTargetId,
    setMarkerTargetId,
    handleCanvasClick,
    updateRoute,
    removeRoute,
  }
}
