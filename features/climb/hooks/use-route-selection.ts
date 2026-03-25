import { useState, useCallback } from 'react'

export interface RoutePoint {
  x: number
  y: number
}

export interface RouteWithLabels {
  id: string
  points: RoutePoint[]
  grade: string
  name: string
  logged?: boolean
}

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

export function pointToLineDistance(
  point: RoutePoint,
  lineStart: RoutePoint,
  lineEnd: RoutePoint
): number {
  const A = point.x - lineStart.x
  const B = point.y - lineStart.y
  const C = lineEnd.x - lineStart.x
  const D = lineEnd.y - lineStart.y

  const dot = A * C + B * D
  const lenSq = C * C + D * D

  let param = -1
  if (lenSq !== 0) {
    param = dot / lenSq
  }

  let xx, yy

  if (param < 0) {
    xx = lineStart.x
    yy = lineStart.y
  } else if (param > 1) {
    xx = lineEnd.x
    yy = lineEnd.y
  } else {
    xx = lineStart.x + param * C
    yy = lineStart.y + param * D
  }

  const dx = point.x - xx
  const dy = point.y - yy

  return Math.sqrt(dx * dx + dy * dy)
}

export function generateCurvePoints(points: RoutePoint[], segmentsPerCurve: number = 8): RoutePoint[] {
  const curvePoints: RoutePoint[] = []

  if (points.length < 2) return points

  curvePoints.push({ x: points[0].x, y: points[0].y })

  for (let i = 1; i < points.length - 1; i++) {
    const xc = (points[i].x + points[i + 1].x) / 2
    const yc = (points[i].y + points[i + 1].y) / 2

    for (let t = 1; t <= segmentsPerCurve; t++) {
      const tNorm = t / segmentsPerCurve
      const x = (1 - tNorm) * (1 - tNorm) * points[i].x + 2 * (1 - tNorm) * tNorm * xc + tNorm * tNorm * points[i + 1].x
      const y = (1 - tNorm) * (1 - tNorm) * points[i].y + 2 * (1 - tNorm) * tNorm * yc + tNorm * tNorm * points[i + 1].y
      curvePoints.push({ x, y })
    }
  }

  curvePoints.push({ x: points[points.length - 1].x, y: points[points.length - 1].y })

  return curvePoints
}

export function findRouteAtPoint(
  routes: RouteWithLabels[],
  point: RoutePoint,
  threshold: number = 15
): RouteWithLabels | null {
  for (const route of routes) {
    const curvePoints = generateCurvePoints(route.points, 8)

    for (let i = 1; i < curvePoints.length; i++) {
      const distance = pointToLineDistance(point, curvePoints[i - 1], curvePoints[i])
      if (distance <= threshold) {
        return route
      }
    }
  }
  return null
}

export function generateRouteId(): string {
  return `route-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}
