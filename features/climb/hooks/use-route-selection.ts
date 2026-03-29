import { useState, useCallback } from 'react'

import { pointToLineDistance, generateCurvePoints, findRouteAtPoint, generateRouteId } from '@/lib/route-geometry'
import type { RoutePoint } from '@/types/domain'
import type { RouteWithLabels } from '@/lib/route-geometry'

interface UseRouteSelectionReturn {
  selectedIds: string[]
  selectRoute: (routeId: string) => void
  deselectRoute: (routeId: string) => void
  clearSelection: () => void
  isSelected: (routeId: string) => boolean
  getSelectedRoutes: (routes: RouteWithLabels[]) => RouteWithLabels[]
  toggleSelection: (routeId: string) => void
}

export function useRouteSelection(): UseRouteSelectionReturn {
  const [selectedIds, setSelectedIds] = useState<string[]>([])

  const selectRoute = useCallback((routeId: string) => {
    setSelectedIds([routeId])
  }, [])

  const deselectRoute = useCallback((routeId: string) => {
    setSelectedIds(prev => prev.filter(id => id !== routeId))
  }, [])

  const clearSelection = useCallback(() => {
    setSelectedIds([])
  }, [])

  const isSelected = useCallback((routeId: string) => {
    return selectedIds.includes(routeId)
  }, [selectedIds])

  const getSelectedRoutes = useCallback((routes: RouteWithLabels[]) => {
    return routes.filter(route => selectedIds.includes(route.id))
  }, [selectedIds])

  const toggleSelection = useCallback((routeId: string) => {
    if (selectedIds.includes(routeId)) {
      setSelectedIds(prev => prev.filter(id => id !== routeId))
    } else {
      setSelectedIds([routeId])
    }
  }, [selectedIds])

  return {
    selectedIds,
    selectRoute,
    deselectRoute,
    clearSelection,
    isSelected,
    getSelectedRoutes,
    toggleSelection
  }
}
