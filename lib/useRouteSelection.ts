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

export function catmullRomSpline(
  points: RoutePoint[],
  _tension: number = 0.5,
  numOfSegments: number = 16
): RoutePoint[] {
  const splinePoints: RoutePoint[] = []

  if (points.length < 2) return points

  for (let i = 0; i < points.length - 1; i++) {
    const p0 = i > 0 ? points[i - 1] : points[0]
    const p1 = points[i]
    const p2 = points[i + 1]
    const p3 = i !== points.length - 2 ? points[i + 2] : p2

    for (let t = 0; t <= numOfSegments; t++) {
      const t2 = t / numOfSegments
      const t3 = t2 * t2
      const t2_3 = 3 * t2 * t2

      const f1 = -0.5 * t3 + t2_3 - 0.5 * t2
      const f2 = 1.5 * t3 - 2.5 * t2_3 + 1
      const f3 = -1.5 * t3 + 2 * t2_3 + 0.5 * t2
      const f4 = 0.5 * t3 - 0.5 * t2_3

      const x = p0.x * f1 + p1.x * f2 + p2.x * f3 + p3.x * f4
      const y = p0.y * f1 + p1.y * f2 + p2.y * f3 + p3.y * f4

      splinePoints.push({ x, y })
    }
  }

  return splinePoints
}

export function findRouteAtPoint(
  routes: RouteWithLabels[],
  point: RoutePoint,
  threshold: number = 15
): RouteWithLabels | null {
  for (const route of routes) {
    const smoothedPoints = catmullRomSpline(route.points, 0.5, 20)

    for (let i = 1; i < smoothedPoints.length; i++) {
      const distance = pointToLineDistance(point, smoothedPoints[i - 1], smoothedPoints[i])
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
