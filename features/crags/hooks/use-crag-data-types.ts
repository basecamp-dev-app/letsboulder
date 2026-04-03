'use client'

import type { ImageRouteTarget } from '@/features/crags/lib/build-crag-image-destination'
import type { CragPageCrag, CragRoute, ImageData, RouteNavigationTarget, RoutePreview } from '@/features/crags/lib/crag-page-types'

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
  loading: boolean
  cragCenter: [number, number] | null
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
  loading: boolean
  cragCenter: [number, number] | null
}
