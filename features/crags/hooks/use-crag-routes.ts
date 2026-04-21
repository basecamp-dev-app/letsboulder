'use client'

import { useEffect, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { cragKeys, fetchCragRoutes } from '@/features/crags/lib/crag-queries'
import { remapRouteNavigationTargetsByEffectiveClimbId, remapRoutePreviewsByEffectiveClimbId } from '@/features/crags/lib/crag-page-domain'
import type { CragRoute, ImageData, RouteNavigationTarget, RoutePreview } from '@/features/crags/lib/crag-page-types'
import type { ImageRouteTarget } from '@/features/crags/lib/build-crag-image-destination'
import type { CachedCragLocalFallback } from '@/features/crags/lib/crag-local-fallback'

export type RoutesLoadState = 'idle' | 'loading' | 'loaded' | 'error'

export interface UseCragRoutesParams {
  id: string
  initialRoutes: CragRoute[] | null
  routesLoadState: RoutesLoadState
  setRoutes: (routes: CragRoute[]) => void
  setRoutesLoadState: (state: RoutesLoadState) => void
  setRoutePreviewByClimbId: (updater: (prev: Record<string, RoutePreview>) => Record<string, RoutePreview>) => void
  setRouteNavigationTargetByClimbId: (updater: (prev: Record<string, RouteNavigationTarget>) => Record<string, RouteNavigationTarget>) => void
  setImages: (images: ImageData[]) => void
  setCragCenter: (center: [number, number] | null) => void
  setDefaultRouteTargetByImageId: (updater: (prev: Record<string, ImageRouteTarget>) => Record<string, ImageRouteTarget>) => void
  setRouteImageIdsByClimbId: (updater: (prev: Record<string, string[]>) => Record<string, string[]>) => void
  setUsingCachedFallback: (value: boolean) => void
  readCachedFallback: () => Promise<CachedCragLocalFallback | null>
}

export function useCragRoutes({
  id,
  initialRoutes,
  routesLoadState,
  setRoutes,
  setRoutesLoadState,
  setRoutePreviewByClimbId,
  setRouteNavigationTargetByClimbId,
  setImages,
  setCragCenter,
  setDefaultRouteTargetByImageId,
  setRouteImageIdsByClimbId,
  setUsingCachedFallback,
  readCachedFallback,
}: UseCragRoutesParams) {
  const hasInitialRouteData = initialRoutes !== null

  useEffect(() => {
    if (!hasInitialRouteData || routesLoadState === 'loaded') return

    setRoutesLoadState('loaded')
  }, [hasInitialRouteData, routesLoadState, setRoutesLoadState])

  const query = useQuery({
    queryKey: cragKeys.routes(id),
    queryFn: () => fetchCragRoutes(id),
    enabled: !hasInitialRouteData && routesLoadState === 'idle',
    staleTime: 5 * 60 * 1000,
    meta: { persist: true },
  })

  const { data, isLoading, isError, isFetching } = query

  const nextLoadState = useMemo<RoutesLoadState | null>(() => {
    if (hasInitialRouteData) return null
    if (isError) return 'error'
    if (isLoading || isFetching) return 'loading'
    if (data) return 'loaded'
    return null
  }, [data, hasInitialRouteData, isError, isFetching, isLoading])

  useEffect(() => {
    if (!data || hasInitialRouteData) return

    const effectiveClimbIdByClimbId = data.effectiveClimbIdByClimbId
    setRoutes(data.routes)
    setUsingCachedFallback(false)
    setRoutePreviewByClimbId((prev) => remapRoutePreviewsByEffectiveClimbId(prev, effectiveClimbIdByClimbId))
    setRouteNavigationTargetByClimbId((prev) => remapRouteNavigationTargetsByEffectiveClimbId(prev, effectiveClimbIdByClimbId))

  }, [data, hasInitialRouteData, setRouteNavigationTargetByClimbId, setRoutePreviewByClimbId, setRoutes, setUsingCachedFallback])

  useEffect(() => {
    if (hasInitialRouteData || !isError) return

    let cancelled = false

    async function hydrateFromCache() {
      const fallback = await readCachedFallback()
      if (!fallback || cancelled) {
        return
      }

      setRoutes(fallback.routes)
      setImages(fallback.images)
      setCragCenter(fallback.cragCenter)
      setDefaultRouteTargetByImageId(() => fallback.defaultRouteTargetByImageId)
      setRouteImageIdsByClimbId(() => fallback.routeImageIdsByClimbId)
      setRoutePreviewByClimbId(() => fallback.routePreviewByClimbId)
      setRouteNavigationTargetByClimbId(() => fallback.routeNavigationTargetByClimbId)
      setRoutesLoadState('loaded')
      setUsingCachedFallback(true)
    }

    void hydrateFromCache()

    return () => {
      cancelled = true
    }
  }, [
    hasInitialRouteData,
    isError,
    readCachedFallback,
    setCragCenter,
    setDefaultRouteTargetByImageId,
    setImages,
    setRouteImageIdsByClimbId,
    setRouteNavigationTargetByClimbId,
    setRoutePreviewByClimbId,
    setRoutes,
    setRoutesLoadState,
    setUsingCachedFallback,
  ])

  useEffect(() => {
    if (!nextLoadState) return

    setRoutesLoadState(nextLoadState)
  }, [nextLoadState, setRoutesLoadState])

  return {
    retryRoutes: query.refetch,
  }

}
