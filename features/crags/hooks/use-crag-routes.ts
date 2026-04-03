'use client'

import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { cragKeys, fetchCragRoutes } from '@/features/crags/lib/crag-queries'
import { remapRouteNavigationTargetsByEffectiveClimbId, remapRoutePreviewsByEffectiveClimbId } from '@/features/crags/lib/crag-page-domain'
import type { CragRoute, RouteNavigationTarget, RoutePreview } from '@/features/crags/lib/crag-page-types'

export type RoutesLoadState = 'idle' | 'loading' | 'loaded' | 'error'

export interface UseCragRoutesParams {
  id: string
  initialRoutes: CragRoute[] | null
  routesLoadState: RoutesLoadState
  setRoutes: (routes: CragRoute[]) => void
  setRoutesLoadState: (state: RoutesLoadState) => void
  setRoutePreviewByClimbId: (updater: (prev: Record<string, RoutePreview>) => Record<string, RoutePreview>) => void
  setRouteNavigationTargetByClimbId: (updater: (prev: Record<string, RouteNavigationTarget>) => Record<string, RouteNavigationTarget>) => void
}

export function useCragRoutes({
  id,
  initialRoutes,
  routesLoadState,
  setRoutes,
  setRoutesLoadState,
  setRoutePreviewByClimbId,
  setRouteNavigationTargetByClimbId,
}: UseCragRoutesParams) {
  const hasInitialRouteData = initialRoutes !== null

  const { data, isLoading, isError, isFetching } = useQuery({
    queryKey: cragKeys.routes(id),
    queryFn: () => fetchCragRoutes(id),
    enabled: !hasInitialRouteData && routesLoadState === 'idle',
    staleTime: 5 * 60 * 1000,
    meta: { persist: true },
  })

  useEffect(() => {
    if (!data) return
    if (hasInitialRouteData) return

    const effectiveClimbIdByClimbId = data.effectiveClimbIdByClimbId
    setRoutes(data.routes)
    setRoutePreviewByClimbId((prev) => remapRoutePreviewsByEffectiveClimbId(prev, effectiveClimbIdByClimbId))
    setRouteNavigationTargetByClimbId((prev) => remapRouteNavigationTargetsByEffectiveClimbId(prev, effectiveClimbIdByClimbId))

    if (isError) {
      setRoutesLoadState('error')
    } else if (!isFetching && !isLoading) {
      setRoutesLoadState('loaded')
    } else if (isLoading || isFetching) {
      setRoutesLoadState('loading')
    }
  }, [data, isError, isFetching, isLoading, hasInitialRouteData, setRoutes, setRoutesLoadState, setRoutePreviewByClimbId, setRouteNavigationTargetByClimbId])

  if (hasInitialRouteData && routesLoadState !== 'loaded') {
    setRoutesLoadState('loaded')
  }
}
