import { useCallback, useRef } from 'react'
import { useRouteStore } from '@/store/routeStore'
import { createRoutePath2D } from '@/lib/routeRenderer'
import type { RoutePoint, RouteLine } from '@/types/domain'

export function useHitTesting() {
  const { routes, activeRouteId, setActiveRoute, interactionTool } = useRouteStore()
  const pathCache = useRef<Map<string, Path2D | null>>(new Map())

  const getPathForRoute = useCallback((route: RouteLine): Path2D | null => {
    const cached = pathCache.current.get(route.id)
    if (cached !== undefined) return cached

    const path = createRoutePath2D(route.points)
    pathCache.current.set(route.id, path)
    return path
  }, [])

  const findRouteAtPoint = useCallback(
    (point: RoutePoint, threshold: number = 20): string | null => {
      const ctx = typeof window !== 'undefined' ? document.createElement('canvas').getContext('2d') : null
      if (!ctx) return null

      const reversedRoutes = [...routes].reverse()

      for (const route of reversedRoutes) {
        const path = getPathForRoute(route)
        if (!path) continue

        ctx.lineWidth = threshold
        const isHit = ctx.isPointInStroke(path, point.x, point.y)
        if (isHit) {
          return route.id
        }
      }

      return null
    },
    [routes, getPathForRoute]
  )

  const handleRouteClick = useCallback(
    (point: RoutePoint) => {
      if (interactionTool !== 'select') return

      const routeId = findRouteAtPoint(point)
      if (routeId) {
        setActiveRoute(routeId === activeRouteId ? null : routeId)
      } else {
        setActiveRoute(null)
      }
    },
    [interactionTool, findRouteAtPoint, activeRouteId, setActiveRoute]
  )

  return {
    findRouteAtPoint,
    handleRouteClick,
    activeRouteId,
  }
}
