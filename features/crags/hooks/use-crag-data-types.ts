'use client'

import type { ImageRouteTarget } from '@/features/crags/lib/build-crag-image-destination'
import type { CragPageCrag, CragRoute, ImageData, RouteNavigationTarget, RoutePreview } from '@/features/crags/lib/crag-page-types'

export interface CragRouteTargetsState {
  routeImageIdsByClimbId: Record<string, string[]>
  routePreviewByClimbId: Record<string, RoutePreview>
  routeNavigationTargetByClimbId: Record<string, RouteNavigationTarget>
  defaultRouteTargetByImageId: Record<string, ImageRouteTarget>
}

export interface UseCragDataParams {
  id: string
  initialCrag?: CragPageCrag | null
  initialImages?: ImageData[]
  initialRoutes?: CragRoute[] | null
  initialRouteImageIdsByClimbId?: Record<string, string[]>
  initialRoutePreviewByClimbId?: Record<string, RoutePreview>
  initialDefaultRouteTargetByImageId?: Record<string, ImageRouteTarget>
  initialRouteNavigationTargetByClimbId?: Record<string, RouteNavigationTarget>
  initialCragCenter?: [number, number] | null
  initialRouteTargetsComplete?: boolean
  initialImagesComplete?: boolean
  initialPayloadLoadedAt?: number
}

export interface UseCragDataResult {
  crag: CragPageCrag | null
  images: ImageData[]
  routes: CragRoute[]
  routeImageIdsByClimbId: Record<string, string[]>
  routePreviewByClimbId: Record<string, RoutePreview>
  routeNavigationTargetByClimbId: Record<string, RouteNavigationTarget>
  defaultRouteTargetByImageId: Record<string, ImageRouteTarget>
  routesLoadState: 'idle' | 'loading' | 'loaded' | 'error'
  retryRoutes: () => Promise<unknown>
  loading: boolean
  cragCenter: [number, number] | null
  routeTargetsHydrating: boolean
  routeTargetsComplete: boolean
  usingCachedFallback: boolean
}

export interface CragDataState {
  crag: CragPageCrag | null
  images: ImageData[]
  routes: CragRoute[]
  routeImageIdsByClimbId: Record<string, string[]>
  routePreviewByClimbId: Record<string, RoutePreview>
  routeNavigationTargetByClimbId: Record<string, RouteNavigationTarget>
  defaultRouteTargetByImageId: Record<string, ImageRouteTarget>
  routesLoadState: 'idle' | 'loading' | 'loaded' | 'error'
  retryRoutes: () => Promise<unknown>
  loading: boolean
  cragCenter: [number, number] | null
  routeTargetsHydrating: boolean
  routeTargetsComplete: boolean
  usingCachedFallback: boolean
}
