'use client'

import { cragKeys } from '@/features/crags/lib/crag-queries'
import type { ImageRouteTarget } from '@/features/crags/lib/build-crag-image-destination'
import type { CragRoute, ImageData, RouteNavigationTarget, RoutePreview } from '@/features/crags/lib/crag-page-types'
import {
  ANON_QUERY_CACHE_SCOPE,
  getPersistedQueries,
  getPersistedQueryData,
  readPersistedQueryClient,
  type PersistedQueryState,
} from '@/lib/query-persistence'
import { createClient } from '@/lib/supabase'

interface CachedCragRoutesResult {
  routes: CragRoute[]
}

interface CachedCragImagesResult {
  crag: {
    latitude: number | null
    longitude: number | null
  }
  images: ImageData[]
  cragCenter: [number, number] | null
  defaultRouteTargetByImageId: Record<string, ImageRouteTarget>
  routeImageIdsByClimbId: Record<string, string[]>
  routePreviewByClimbId: Record<string, RoutePreview>
  routeNavigationTargetByClimbId: Record<string, RouteNavigationTarget>
}

export interface CachedCragLocalFallback {
  routes: CragRoute[]
  images: ImageData[]
  cragCenter: [number, number] | null
  defaultRouteTargetByImageId: Record<string, ImageRouteTarget>
  routeImageIdsByClimbId: Record<string, string[]>
  routePreviewByClimbId: Record<string, RoutePreview>
  routeNavigationTargetByClimbId: Record<string, RouteNavigationTarget>
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

async function getPreferredQueryScopes() {
  const scopes = new Set<string>([ANON_QUERY_CACHE_SCOPE])

  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (user?.id) {
      scopes.add(user.id)
    }
  } catch {
    // Keep anon fallback only.
  }

  return Array.from(scopes).reverse()
}

function getCachedFallbackFromQueries(queries: PersistedQueryState[], cragId: string): CachedCragLocalFallback | null {
  const routesData = getPersistedQueryData<CachedCragRoutesResult>(queries, cragKeys.routes(cragId))
  const imagesData = getPersistedQueryData<CachedCragImagesResult>(queries, cragKeys.images(cragId))

  const routes = Array.isArray(routesData?.routes) ? routesData.routes : []
  const images = Array.isArray(imagesData?.images) ? imagesData.images : []
  const cragCenter = Array.isArray(imagesData?.cragCenter) ? imagesData.cragCenter : null
  const defaultRouteTargetByImageId = isObjectRecord(imagesData?.defaultRouteTargetByImageId)
    ? imagesData.defaultRouteTargetByImageId as Record<string, ImageRouteTarget>
    : {}
  const routeImageIdsByClimbId = isObjectRecord(imagesData?.routeImageIdsByClimbId)
    ? imagesData.routeImageIdsByClimbId as Record<string, string[]>
    : {}
  const routePreviewByClimbId = isObjectRecord(imagesData?.routePreviewByClimbId)
    ? imagesData.routePreviewByClimbId as Record<string, RoutePreview>
    : {}
  const routeNavigationTargetByClimbId = isObjectRecord(imagesData?.routeNavigationTargetByClimbId)
    ? imagesData.routeNavigationTargetByClimbId as Record<string, RouteNavigationTarget>
    : {}

  if (routes.length === 0 && images.length === 0) {
    return null
  }

  return {
    routes,
    images,
    cragCenter,
    defaultRouteTargetByImageId,
    routeImageIdsByClimbId,
    routePreviewByClimbId,
    routeNavigationTargetByClimbId,
  }
}

export async function readCachedCragLocalFallback(cragId: string): Promise<CachedCragLocalFallback | null> {
  const scopes = await getPreferredQueryScopes()

  for (const scope of scopes) {
    const persistedClient = await readPersistedQueryClient(scope)
    const queries = getPersistedQueries(persistedClient)
    const fallback = getCachedFallbackFromQueries(queries, cragId)
    if (fallback) {
      return fallback
    }
  }

  return null
}
