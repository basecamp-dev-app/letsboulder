'use client'

import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react'
import { useQuery } from '@tanstack/react-query'
import { cragKeys, fetchCragImages } from '@/features/crags/lib/crag-queries'
import type { CragPageCrag, CragRoute, ImageData, RouteNavigationTarget, RoutePreview } from '@/features/crags/lib/crag-page-types'
import type { ImageRouteTarget } from '@/features/crags/lib/build-crag-image-destination'
import type { RoutesLoadState } from '@/features/crags/hooks/use-crag-routes'

const CRAG_IMAGE_CACHE_TTL_MS = 5 * 60 * 1000
const cragImageCache = new Map<string, CachedCragImageData>()

function getFreshCachedCragData(id: string) {
  const cached = cragImageCache.get(id)
  if (!cached) return null
  return Date.now() - cached.cachedAt <= CRAG_IMAGE_CACHE_TTL_MS ? cached : null
}

interface CachedCragImageData {
  crag: CragPageCrag
  images: ImageData[]
  cragCenter: [number, number] | null
  defaultRouteTargetByImageId: Record<string, ImageRouteTarget>
  routeImageIdsByClimbId: Record<string, string[]>
  routePreviewByClimbId: Record<string, RoutePreview>
  routeNavigationTargetByClimbId: Record<string, RouteNavigationTarget>
  cachedAt: number
}

export interface UseCragImagesParams {
  id: string
  initialCrag: CragPageCrag | null
  initialImages: ImageData[]
  initialRoutes: CragRoute[] | null
  initialRouteImageIdsByClimbId: Record<string, string[]>
  initialRoutePreviewByClimbId: Record<string, RoutePreview>
  initialDefaultRouteTargetByImageId: Record<string, ImageRouteTarget>
  initialRouteNavigationTargetByClimbId: Record<string, RouteNavigationTarget>
  initialCragCenter: [number, number] | null
  initialPayloadLoadedAt: number | undefined
  setCrag: Dispatch<SetStateAction<CragPageCrag | null>>
  setImages: Dispatch<SetStateAction<ImageData[]>>
  setRouteImageIdsByClimbId: Dispatch<SetStateAction<Record<string, string[]>>>
  setRoutePreviewByClimbId: Dispatch<SetStateAction<Record<string, RoutePreview>>>
  setRouteNavigationTargetByClimbId: Dispatch<SetStateAction<Record<string, RouteNavigationTarget>>>
  setDefaultRouteTargetByImageId: Dispatch<SetStateAction<Record<string, ImageRouteTarget>>>
  setCragCenter: Dispatch<SetStateAction<[number, number] | null>>
  setLoading: Dispatch<SetStateAction<boolean>>
  setRoutesLoadState: Dispatch<SetStateAction<RoutesLoadState>>
}

export function useCragImages({
  id,
  initialCrag,
  initialImages,
  initialRoutes,
  initialRouteImageIdsByClimbId,
  initialRoutePreviewByClimbId,
  initialDefaultRouteTargetByImageId,
  initialRouteNavigationTargetByClimbId,
  initialCragCenter,
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
}: UseCragImagesParams) {
  const hasInitialRouteData = initialRoutes !== null

  // eslint-disable-next-line react-hooks/purity -- one-time mount timestamp for cache freshness check
  const mountTimestamp = useMemo(() => Date.now(), [])
  const hasFreshInitialPayload = useMemo(() => {
    if (!initialCrag || initialImages.length === 0 || !initialPayloadLoadedAt) return false
    return mountTimestamp - initialPayloadLoadedAt <= CRAG_IMAGE_CACHE_TTL_MS
  }, [initialCrag, initialImages.length, initialPayloadLoadedAt, mountTimestamp])

  // Seed in-memory cache from fresh SSR payload
  useEffect(() => {
    if (!hasFreshInitialPayload) return

    cragImageCache.set(id, {
      crag: initialCrag!,
      images: initialImages,
      cragCenter: initialCragCenter,
      defaultRouteTargetByImageId: initialDefaultRouteTargetByImageId,
      routeImageIdsByClimbId: initialRouteImageIdsByClimbId,
      routePreviewByClimbId: initialRoutePreviewByClimbId,
      routeNavigationTargetByClimbId: initialRouteNavigationTargetByClimbId,
      cachedAt: initialPayloadLoadedAt || Date.now(),
    })
  }, [
    hasFreshInitialPayload,
    id,
    initialCrag,
    initialCragCenter,
    initialDefaultRouteTargetByImageId,
    initialImages,
    initialPayloadLoadedAt,
    initialRouteImageIdsByClimbId,
    initialRouteNavigationTargetByClimbId,
    initialRoutePreviewByClimbId,
  ])

  const { data, isLoading, isError, isFetching } = useQuery({
    queryKey: cragKeys.images(id),
    queryFn: () => fetchCragImages(id, initialCrag),
    enabled: !hasFreshInitialPayload,
    initialData: hasFreshInitialPayload
      ? {
          crag: initialCrag!,
          images: initialImages,
          cragCenter: initialCragCenter,
          defaultRouteTargetByImageId: initialDefaultRouteTargetByImageId,
          routeImageIdsByClimbId: initialRouteImageIdsByClimbId,
          routePreviewByClimbId: initialRoutePreviewByClimbId,
          routeNavigationTargetByClimbId: initialRouteNavigationTargetByClimbId,
        }
      : undefined,
    staleTime: 5 * 60 * 1000,
    meta: { persist: true },
  })

  // Sync React Query result to parent state
  useEffect(() => {
    if (!data) return

    setCrag(data.crag)
    setImages(data.images)
    setCragCenter(data.cragCenter)
    setDefaultRouteTargetByImageId(data.defaultRouteTargetByImageId)
    setRouteImageIdsByClimbId(data.routeImageIdsByClimbId)
    setRoutePreviewByClimbId(data.routePreviewByClimbId)
    setRouteNavigationTargetByClimbId(data.routeNavigationTargetByClimbId)
    setLoading(false)

    // Cache in memory for fast subsequent navigations
    cragImageCache.set(id, {
      crag: data.crag,
      images: data.images,
      cragCenter: data.cragCenter,
      defaultRouteTargetByImageId: data.defaultRouteTargetByImageId,
      routeImageIdsByClimbId: data.routeImageIdsByClimbId,
      routePreviewByClimbId: data.routePreviewByClimbId,
      routeNavigationTargetByClimbId: data.routeNavigationTargetByClimbId,
      cachedAt: Date.now(),
    })
  }, [data, id, setCrag, setImages, setCragCenter, setDefaultRouteTargetByImageId, setRouteImageIdsByClimbId, setRoutePreviewByClimbId, setRouteNavigationTargetByClimbId, setLoading])

  // Loading state management
  useEffect(() => {
    if (hasFreshInitialPayload) {
      setLoading(false)
      if (!hasInitialRouteData) {
        setRoutesLoadState('idle')
      }
      return
    }

    if (isLoading || isFetching) {
      if (!initialCrag) setLoading(true)
    } else {
      setLoading(false)
    }

    if (!hasInitialRouteData) {
      setRoutesLoadState('idle')
    }
  }, [hasFreshInitialPayload, hasInitialRouteData, isLoading, isFetching, initialCrag, setLoading, setRoutesLoadState])
}
