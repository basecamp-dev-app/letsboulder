'use client'

import { useState, type Dispatch, type SetStateAction } from 'react'
import { useCragImages } from '@/features/crags/hooks/use-crag-images'
import { useCragRoutes } from '@/features/crags/hooks/use-crag-routes'
import type { CragRouteTargetsState, UseCragDataParams, UseCragDataResult } from '@/features/crags/hooks/use-crag-data-types'

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
  initialCriticalImagesComplete = false,
  initialPayloadLoadedAt,
}: UseCragDataParams): UseCragDataResult {
  const [crag, setCrag] = useState(initialCrag)
  const [images, setImages] = useState(initialImages)
  const [routes, setRoutes] = useState(initialRoutes || [])
  const [routeTargets, setRouteTargets] = useState<CragRouteTargetsState>({
    routeImageIdsByClimbId: initialRouteImageIdsByClimbId,
    routePreviewByClimbId: initialRoutePreviewByClimbId,
    routeNavigationTargetByClimbId: initialRouteNavigationTargetByClimbId,
    defaultRouteTargetByImageId: initialDefaultRouteTargetByImageId,
  })
  const [routesLoadState, setRoutesLoadState] = useState<'idle' | 'loading' | 'loaded' | 'error'>(initialRoutes !== null ? 'loaded' : 'idle')
  const [loading, setLoading] = useState(!initialCrag)
  const [cragCenter, setCragCenter] = useState(initialCragCenter)

  const setCragRouteTargets: Dispatch<SetStateAction<CragRouteTargetsState>> = setRouteTargets

  useCragImages({
    id,
    initialCrag,
    initialImages,
    initialRoutes,
    initialRouteImageIdsByClimbId,
    initialRoutePreviewByClimbId,
    initialDefaultRouteTargetByImageId,
    initialRouteNavigationTargetByClimbId,
    initialCragCenter,
    initialRouteTargetsComplete,
    initialCriticalImagesComplete,
    initialPayloadLoadedAt,
    setCrag,
    setImages,
    setRouteTargets: setCragRouteTargets,
    setCragCenter,
    setLoading,
    setRoutesLoadState,
  })

  const { retryRoutes } = useCragRoutes({
    id,
    initialRoutes,
    routesLoadState,
    setRoutes,
    setRoutesLoadState,
    setRouteTargets: setCragRouteTargets,
  })

  const routeTargetsHydrating = false
  const routeTargetsComplete = initialRouteTargetsComplete || routes.length === 0

  return {
    crag,
    images,
    routes,
    routeImageIdsByClimbId: routeTargets.routeImageIdsByClimbId,
    routePreviewByClimbId: routeTargets.routePreviewByClimbId,
    routeNavigationTargetByClimbId: routeTargets.routeNavigationTargetByClimbId,
    defaultRouteTargetByImageId: routeTargets.defaultRouteTargetByImageId,
    routesLoadState,
    retryRoutes,
    loading,
    cragCenter,
    routeTargetsHydrating,
    routeTargetsComplete,
  }
}
