'use client'

import { useQuery } from '@tanstack/react-query'
import { cragKeys, fetchCragImages } from '@/features/crags/lib/crag-queries'
import type { CragPageCrag, ImageData, RouteNavigationTarget, RoutePreview } from '@/features/crags/lib/crag-page-types'
import type { ImageRouteTarget } from '@/features/crags/lib/build-crag-image-destination'

const CRAG_IMAGE_STALE_TIME_MS = 5 * 60 * 1000

export interface UseCragImagesParams {
  id: string
  initialCrag: CragPageCrag | null
  initialImages: ImageData[]
  initialRouteImageIdsByClimbId: Record<string, string[]>
  initialRoutePreviewByClimbId: Record<string, RoutePreview>
  initialDefaultRouteTargetByImageId: Record<string, ImageRouteTarget>
  initialRouteNavigationTargetByClimbId: Record<string, RouteNavigationTarget>
  initialCragCenter: [number, number] | null
  initialPayloadLoadedAt: number | undefined
}

export function useCragImages({
  id,
  initialCrag,
  initialImages,
  initialRouteImageIdsByClimbId,
  initialRoutePreviewByClimbId,
  initialDefaultRouteTargetByImageId,
  initialRouteNavigationTargetByClimbId,
  initialCragCenter,
  initialPayloadLoadedAt,
}: UseCragImagesParams) {
  const hasInitialImageData = Boolean(initialCrag)

  return useQuery({
    queryKey: cragKeys.images(id),
    queryFn: () => fetchCragImages(id),
    initialData: hasInitialImageData
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
    initialDataUpdatedAt: initialPayloadLoadedAt,
    staleTime: CRAG_IMAGE_STALE_TIME_MS,
    meta: { persist: true },
  })
}
