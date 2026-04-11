'use client'

import { useEffect, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { cragKeys } from '@/features/crags/lib/crag-queries'
import type { CragRoute, ImageData, RouteNavigationTarget, RoutePreview } from '@/features/crags/lib/crag-page-types'
import type { ImageRouteTarget } from '@/features/crags/lib/build-crag-image-destination'

const CRAG_DEBUG_ROUTE_IDS = new Set([
  '8f450e11-55f7-40dd-b04b-e48d0061fd7b',
  '84d00fe1-44a6-48b5-b7e2-ef3205957df1',
  'e03dde44-6aef-454a-b4b1-e8237c040407',
  '1969f064-41d8-4150-b469-d09cbea993bc',
])

export interface UseCragRouteTargetsParams {
  routes: CragRoute[]
  initialRouteTargetsComplete: boolean
  setRouteImageIdsByClimbId: (updater: (prev: Record<string, string[]>) => Record<string, string[]>) => void
  setRoutePreviewByClimbId: (updater: (prev: Record<string, RoutePreview>) => Record<string, RoutePreview>) => void
  setRouteNavigationTargetByClimbId: (updater: (prev: Record<string, RouteNavigationTarget>) => Record<string, RouteNavigationTarget>) => void
}

export function useCragRouteTargets({
  routes,
  initialRouteTargetsComplete,
  setRouteImageIdsByClimbId,
  setRoutePreviewByClimbId,
  setRouteNavigationTargetByClimbId,
}: UseCragRouteTargetsParams) {
  const climbIdsFingerprint = useMemo(() => {
    return Array.from(new Set(routes.map((route) => route.id)))
      .sort((a, b) => a.localeCompare(b))
      .join(',')
  }, [routes])

  const isOffline = typeof navigator !== 'undefined' && navigator.onLine === false

  const { data } = useQuery({
    queryKey: cragKeys.routeTargets(climbIdsFingerprint),
    queryFn: async () => {
      if (!climbIdsFingerprint) return null
      const climbIds = climbIdsFingerprint.split(',').filter(Boolean)
      if (climbIds.length === 0) return null
      const response = await fetch(`/api/crags/route-targets?climbIds=${encodeURIComponent(climbIds.join(','))}`, {
        method: 'GET',
        credentials: 'same-origin',
      })
      if (!response.ok) {
        throw new Error(`Failed to fetch route targets: ${response.status}`)
      }

      const data = await response.json() as {
        defaultRouteTargetByImageId: Record<string, ImageRouteTarget>
        routeImageIdsByClimbId: Record<string, string[]>
        routePreviewByClimbId: Record<string, RoutePreview>
        routeNavigationTargetByClimbId: Record<string, RouteNavigationTarget>
      }

      console.log('[Crag Route Targets Client Debug]', {
        requestedClimbIds: climbIds.length,
        returnedRouteImageKeys: Object.keys(data.routeImageIdsByClimbId).length,
        returnedPreviewKeys: Object.keys(data.routePreviewByClimbId).length,
        returnedNavigationKeys: Object.keys(data.routeNavigationTargetByClimbId).length,
        debugRoutes: climbIds.filter((climbId) => CRAG_DEBUG_ROUTE_IDS.has(climbId)).map((climbId) => ({
          climbId,
          routeImageIds: data.routeImageIdsByClimbId[climbId] || [],
          preview: data.routePreviewByClimbId[climbId] || null,
          navigationTarget: data.routeNavigationTargetByClimbId[climbId] || null,
        })),
      })

      return {
        nextDefaultRouteTargetByImageId: data.defaultRouteTargetByImageId,
        nextRouteImageIdsByClimbId: data.routeImageIdsByClimbId,
        nextRoutePreviewByClimbId: data.routePreviewByClimbId,
        nextRouteNavigationTargetByClimbId: data.routeNavigationTargetByClimbId,
      }
    },
    enabled: !!climbIdsFingerprint && !initialRouteTargetsComplete && !isOffline,
    staleTime: 5 * 60 * 1000,
    meta: { persist: true },
  })

  useEffect(() => {
    if (!data) return
    setRouteImageIdsByClimbId(() => data.nextRouteImageIdsByClimbId)
    setRoutePreviewByClimbId((prev) => ({ ...prev, ...data.nextRoutePreviewByClimbId }))
    setRouteNavigationTargetByClimbId((prev) => ({ ...prev, ...data.nextRouteNavigationTargetByClimbId }))
  }, [data, setRouteImageIdsByClimbId, setRoutePreviewByClimbId, setRouteNavigationTargetByClimbId])
}
