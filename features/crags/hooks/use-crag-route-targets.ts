'use client'

import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { cragKeys } from '@/features/crags/lib/crag-queries'
import type { ImageRouteTarget } from '@/features/crags/lib/build-crag-image-destination'
import type { CragRoute, RouteNavigationTarget, RoutePreview } from '@/features/crags/lib/crag-page-types'

interface RouteTargetPageResult {
  nextDefaultRouteTargetByImageId: Record<string, ImageRouteTarget>
  nextRouteImageIdsByClimbId: Record<string, string[]>
  nextRoutePreviewByClimbId: Record<string, RoutePreview>
  nextRouteNavigationTargetByClimbId: Record<string, RouteNavigationTarget>
  hasMore: boolean
}

async function fetchAllRouteTargets(cragId: string): Promise<RouteTargetPageResult | null> {
  if (!cragId) return null

  const response = await fetch(
    `/api/crags/route-targets?cragId=${encodeURIComponent(cragId)}`,
    {
      method: 'GET',
      credentials: 'same-origin',
    }
  )

  if (!response.ok) {
    throw new Error(`Failed to fetch route targets: ${response.status}`)
  }

  const data = await response.json() as {
    defaultRouteTargetByImageId: Record<string, ImageRouteTarget>
    routeImageIdsByClimbId: Record<string, string[]>
    routePreviewByClimbId: Record<string, RoutePreview>
    routeNavigationTargetByClimbId: Record<string, RouteNavigationTarget>
    hasMore: boolean
  }

  return {
    nextDefaultRouteTargetByImageId: data.defaultRouteTargetByImageId,
    nextRouteImageIdsByClimbId: data.routeImageIdsByClimbId,
    nextRoutePreviewByClimbId: data.routePreviewByClimbId,
    nextRouteNavigationTargetByClimbId: data.routeNavigationTargetByClimbId,
    hasMore: data.hasMore,
  }
}

export interface UseCragRouteTargetsParams {
  cragId: string
  routes: CragRoute[]
  initialRouteTargetsComplete: boolean
  setDefaultRouteTargetByImageId: (updater: (prev: Record<string, ImageRouteTarget>) => Record<string, ImageRouteTarget>) => void
  setRouteImageIdsByClimbId: (updater: (prev: Record<string, string[]>) => Record<string, string[]>) => void
  setRoutePreviewByClimbId: (updater: (prev: Record<string, RoutePreview>) => Record<string, RoutePreview>) => void
  setRouteNavigationTargetByClimbId: (updater: (prev: Record<string, RouteNavigationTarget>) => Record<string, RouteNavigationTarget>) => void
}

export function useCragRouteTargets({
  cragId,
  routes,
  initialRouteTargetsComplete,
  setDefaultRouteTargetByImageId,
  setRouteImageIdsByClimbId,
  setRoutePreviewByClimbId,
  setRouteNavigationTargetByClimbId,
}: UseCragRouteTargetsParams) {
  const isOffline = typeof navigator !== 'undefined' && navigator.onLine === false
  const shouldLoad = routes.length > 0 && !initialRouteTargetsComplete && !isOffline

  const routeTargetsQuery = useQuery({
    queryKey: cragKeys.routeTargets(cragId),
    queryFn: () => fetchAllRouteTargets(cragId),
    enabled: !!cragId && shouldLoad,
    staleTime: 5 * 60 * 1000,
    meta: { persist: true },
  })

  useEffect(() => {
    if (!routeTargetsQuery.data) return

    const data = routeTargetsQuery.data
    setDefaultRouteTargetByImageId(() => data.nextDefaultRouteTargetByImageId)
    setRouteImageIdsByClimbId(() => data.nextRouteImageIdsByClimbId)
    setRoutePreviewByClimbId(() => data.nextRoutePreviewByClimbId)
    setRouteNavigationTargetByClimbId(() => data.nextRouteNavigationTargetByClimbId)
  }, [
    routeTargetsQuery.data,
    setDefaultRouteTargetByImageId,
    setRouteImageIdsByClimbId,
    setRouteNavigationTargetByClimbId,
    setRoutePreviewByClimbId,
  ])
}
