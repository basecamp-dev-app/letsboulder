'use client'

import { useState } from 'react'
import { useCragImages } from '@/features/crags/hooks/use-crag-images'
import { useCragRoutes } from '@/features/crags/hooks/use-crag-routes'
import { useCragRouteTargets } from '@/features/crags/hooks/use-crag-route-targets'
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
  initialImagesComplete = false,
  initialPayloadLoadedAt,
}: UseCragDataParams): UseCragDataResult {
  const [crag, setCrag] = useState(initialCrag)
  const [images, setImages] = useState(initialImages)
  const [routes, setRoutes] = useState(initialRoutes || [])
  const [routeImageIdsByClimbId, setRouteImageIdsByClimbId] = useState(initialRouteImageIdsByClimbId)
  const [routePreviewByClimbId, setRoutePreviewByClimbId] = useState(initialRoutePreviewByClimbId)
  const [routeNavigationTargetByClimbId, setRouteNavigationTargetByClimbId] = useState(initialRouteNavigationTargetByClimbId)
  const [defaultRouteTargetByImageId, setDefaultRouteTargetByImageId] = useState(initialDefaultRouteTargetByImageId)
  const [routesLoadState, setRoutesLoadState] = useState<'idle' | 'loading' | 'loaded' | 'error'>(initialRoutes !== null ? 'loaded' : 'idle')
  const [loading, setLoading] = useState(!initialCrag)
  const [cragCenter, setCragCenter] = useState(initialCragCenter)

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
    initialImagesComplete,
    initialPayloadLoadedAt,
    setCrag,
    setImages,
    setRouteImageIdsByClimbId,
    setRoutePreviewByClimbId,
    setRouteNavigationTargetByClimbId,
    setDefaultRouteTargetByImageId,
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
    setRoutePreviewByClimbId,
    setRouteNavigationTargetByClimbId,
  })

  useCragRouteTargets({
    cragId: id,
    routes,
    initialRouteTargetsComplete,
    setDefaultRouteTargetByImageId,
    setRouteImageIdsByClimbId,
    setRoutePreviewByClimbId,
    setRouteNavigationTargetByClimbId,
  })

  return {
    crag,
    images,
    routes,
    routeImageIdsByClimbId,
    routePreviewByClimbId,
    routeNavigationTargetByClimbId,
    defaultRouteTargetByImageId,
    routesLoadState,
    retryRoutes,
    loading,
    cragCenter,
  }
}
