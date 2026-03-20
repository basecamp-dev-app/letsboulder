import { useCallback, useRef } from 'react'
import { useRouteStore } from '@/store/routeStore'
import { createRoutePath2D } from '@/lib/routeRenderer'
import type { RoutePoint, RouteLine } from '@/types/domain'

const THRESHOLD_DESKTOP = 0.015
const THRESHOLD_MOBILE = 0.03

function isMobileDevice(): boolean {
  if (typeof window === 'undefined') return false
  return navigator.maxTouchPoints > 0
}

export function useHitTesting(routes: RouteLine[]) {
  const { activeRouteId, setActiveRoute, setSelectedRoute, interactionTool } = useRouteStore()
  const pathCache = useRef<Map<string, Path2D | null>>(new Map())

  const getPathForRoute = useCallback((route: RouteLine): Path2D | null => {
    const cached = pathCache.current.get(route.id)
    if (cached !== undefined) return cached

    const path = createRoutePath2D(route.points)
    pathCache.current.set(route.id, path)
    return path
  }, [])

  const findRouteAtPoint = useCallback(
    (point: RoutePoint): string | null => {
      const threshold = isMobileDevice() ? THRESHOLD_MOBILE : THRESHOLD_DESKTOP
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
      if (interactionTool !== 'select') return null

      const routeId = findRouteAtPoint(point)
      if (routeId) {
        const newRouteId = routeId === activeRouteId ? null : routeId
        setActiveRoute(newRouteId)
        setSelectedRoute(newRouteId)
        return newRouteId
      } else {
        setActiveRoute(null)
        setSelectedRoute(null)
        return null
      }
    },
    [interactionTool, findRouteAtPoint, activeRouteId, setActiveRoute, setSelectedRoute]
  )

  return {
    findRouteAtPoint,
    handleRouteClick,
    activeRouteId,
  }
}
