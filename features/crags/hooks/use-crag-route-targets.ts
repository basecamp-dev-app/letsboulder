'use client'

import type { Dispatch, SetStateAction } from 'react'
import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { cragKeys } from '@/features/crags/lib/crag-queries'
import type { CragRouteTargetsState } from '@/features/crags/hooks/use-crag-data-types'
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
  setRouteTargets: Dispatch<SetStateAction<CragRouteTargetsState>>
}

export interface UseCragRouteTargetsResult {
  routeTargetsHydrating: boolean
  routeTargetsComplete: boolean
}

export function useCragRouteTargets({
  cragId,
  routes,
  initialRouteTargetsComplete,
  setRouteTargets,
}: UseCragRouteTargetsParams): UseCragRouteTargetsResult {
  const shouldLoad = false

  const routeTargetsQuery = useQuery({
    queryKey: cragKeys.routeTargets(cragId),
    queryFn: () => fetchAllRouteTargets(cragId),
    enabled: false,
    staleTime: 5 * 60 * 1000,
    meta: { persist: true },
  })

  useEffect(() => {
    // eslint-disable-next-line no-console
    console.log('CRAG_DEBUG', {
      stage: 'use_crag_route_targets:query',
      cragId,
      shouldLoad,
      routesCount: routes.length,
      initialRouteTargetsComplete,
      queryStatus: routeTargetsQuery.status,
      isLoading: routeTargetsQuery.isLoading,
      isFetching: routeTargetsQuery.isFetching,
      hasData: Boolean(routeTargetsQuery.data),
      hasError: Boolean(routeTargetsQuery.error),
    })
  }, [
    cragId,
    initialRouteTargetsComplete,
    routeTargetsQuery.data,
    routeTargetsQuery.error,
    routeTargetsQuery.isFetching,
    routeTargetsQuery.isLoading,
    routeTargetsQuery.status,
    routes.length,
    shouldLoad,
  ])

  useEffect(() => {
    if (!routeTargetsQuery.data) return

    const data = routeTargetsQuery.data
    // eslint-disable-next-line no-console
    console.log('CRAG_DEBUG', {
      stage: 'use_crag_route_targets:apply_data',
      cragId,
      routeImageIdsCount: Object.keys(data.nextRouteImageIdsByClimbId).length,
      routePreviewCount: Object.keys(data.nextRoutePreviewByClimbId).length,
      routeNavigationTargetCount: Object.keys(data.nextRouteNavigationTargetByClimbId).length,
      defaultRouteTargetCount: Object.keys(data.nextDefaultRouteTargetByImageId).length,
      hasMore: data.hasMore,
    })
    setRouteTargets(() => ({
      defaultRouteTargetByImageId: data.nextDefaultRouteTargetByImageId,
      routeImageIdsByClimbId: data.nextRouteImageIdsByClimbId,
      routePreviewByClimbId: data.nextRoutePreviewByClimbId,
      routeNavigationTargetByClimbId: data.nextRouteNavigationTargetByClimbId,
    }))
  }, [
    cragId,
    routeTargetsQuery.data,
    setRouteTargets,
  ])

  return {
    routeTargetsHydrating: false,
    routeTargetsComplete: initialRouteTargetsComplete || routes.length === 0 || Boolean(routeTargetsQuery.data),
  }
}
