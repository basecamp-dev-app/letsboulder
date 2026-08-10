'use client'

import { useMemo } from 'react'
import { useCragImages } from '@/features/crags/hooks/use-crag-images'
import { useCragRoutes } from '@/features/crags/hooks/use-crag-routes'
import { remapRouteNavigationTargetsByEffectiveClimbId, remapRoutePreviewsByEffectiveClimbId } from '@/features/crags/lib/crag-page-domain'
import type { UseCragDataParams, UseCragDataResult } from '@/features/crags/hooks/use-crag-data-types'

export type { UseCragDataParams, UseCragDataResult, CragDataState } from '@/features/crags/hooks/use-crag-data-types'

export function useCragData({
  id,
  initialCrag = null,
  initialImages = [],
  initialRoutes = null,
  initialRouteImageIdsByClimbId = {},
  initialRoutePreviewByClimbId = {},
  initialDefaultRouteTargetByImageId = {},
  initialRouteNavigationTargetByClimbId = {},
  initialCragCenter = null,
  initialRouteTargetsComplete = false,
  initialPayloadLoadedAt,
}: UseCragDataParams): UseCragDataResult {
  const imagesQuery = useCragImages({
    id,
    initialCrag,
    initialImages,
    initialRouteImageIdsByClimbId,
    initialRoutePreviewByClimbId,
    initialDefaultRouteTargetByImageId,
    initialRouteNavigationTargetByClimbId,
    initialCragCenter,
    initialPayloadLoadedAt,
  })

  const routesQuery = useCragRoutes({
    id,
    initialRoutes,
  })

  const imageData = imagesQuery.data
  const routeData = routesQuery.data
  const routes = routeData?.routes || []
  const routeTargets = useMemo(() => ({
    routeImageIdsByClimbId: imageData?.routeImageIdsByClimbId || {},
    routePreviewByClimbId: remapRoutePreviewsByEffectiveClimbId(
      imageData?.routePreviewByClimbId || {},
      routeData?.effectiveClimbIdByClimbId || {}
    ),
    routeNavigationTargetByClimbId: remapRouteNavigationTargetsByEffectiveClimbId(
      imageData?.routeNavigationTargetByClimbId || {},
      routeData?.effectiveClimbIdByClimbId || {}
    ),
    defaultRouteTargetByImageId: imageData?.defaultRouteTargetByImageId || {},
  }), [imageData, routeData])
  const routesLoadState = routesQuery.isError
    ? 'error'
    : routesQuery.isLoading || routesQuery.isFetching
      ? 'loading'
      : routeData
        ? 'loaded'
        : 'idle'
  const routeTargetsHydrating = false
  const routeTargetsComplete = initialRouteTargetsComplete || routes.length === 0

  return {
    crag: imageData?.crag || null,
    images: imageData?.images || [],
    routes,
    routeImageIdsByClimbId: routeTargets.routeImageIdsByClimbId,
    routePreviewByClimbId: routeTargets.routePreviewByClimbId,
    routeNavigationTargetByClimbId: routeTargets.routeNavigationTargetByClimbId,
    defaultRouteTargetByImageId: routeTargets.defaultRouteTargetByImageId,
    routesLoadState,
    retryRoutes: routesQuery.refetch,
    loading: imagesQuery.isLoading || imagesQuery.isFetching,
    cragCenter: imageData?.cragCenter || null,
    routeTargetsHydrating,
    routeTargetsComplete,
  }
}
