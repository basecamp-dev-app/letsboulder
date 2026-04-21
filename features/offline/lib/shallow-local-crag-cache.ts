'use client'

import { cragKeys } from '@/features/crags/lib/crag-queries'
import { buildCragImageDestination } from '@/features/crags/lib/build-crag-image-destination'
import type { CragRoute, RouteNavigationTarget, RoutePreview } from '@/features/crags/lib/crag-page-types'
import {
  ANON_QUERY_CACHE_SCOPE,
  getPersistedQueries,
  getPersistedQueryData,
  type PersistedQueryState,
  readPersistedQueryClient,
} from '@/lib/query-persistence'
import { createClient } from '@/lib/supabase'

export interface CachedCragRouteSummary {
  id: string
  name: string
  grade: string
  href: string
  previewImageUrl: string | null
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
    // Keep anon fallback only
  }

  return Array.from(scopes).reverse()
}

function isRouteNavigationTargetRecord(value: unknown): value is Record<string, RouteNavigationTarget> {
  if (!isObjectRecord(value)) return false
  return Object.values(value).every((candidate) => {
    if (!isObjectRecord(candidate)) return false
    return typeof candidate.displayImageId === 'string' && typeof candidate.routeId === 'string'
  })
}

function isRoutePreviewRecord(value: unknown): value is Record<string, RoutePreview> {
  if (!isObjectRecord(value)) return false
  return Object.values(value).every((candidate) => {
    if (!isObjectRecord(candidate)) return false
    return typeof candidate.imageId === 'string' && typeof candidate.imageUrl === 'string'
  })
}

interface CachedCragRoutesResult {
  routes: CragRoute[]
}

interface CachedCragImagesResult {
  routeNavigationTargetByClimbId: Record<string, RouteNavigationTarget>
  routePreviewByClimbId: Record<string, RoutePreview>
}

export function buildShallowLocalCragClimbsFromQueries(
  queries: PersistedQueryState[],
  cragId: string,
  routeHrefBase: string,
): CachedCragRouteSummary[] {
  const routesData = getPersistedQueryData<CachedCragRoutesResult>(queries, cragKeys.routes(cragId))
  const imagesData = getPersistedQueryData<CachedCragImagesResult>(queries, cragKeys.images(cragId))

  const routes = Array.isArray(routesData?.routes) ? routesData.routes : []
  const navigationTargets = isRouteNavigationTargetRecord(imagesData?.routeNavigationTargetByClimbId)
    ? imagesData.routeNavigationTargetByClimbId
    : {}
  const previews = isRoutePreviewRecord(imagesData?.routePreviewByClimbId)
    ? imagesData.routePreviewByClimbId
    : {}

  return routes
    .map((route) => {
      const target = navigationTargets[route.id]
      if (!target) return null

      return {
        id: route.id,
        name: route.name,
        grade: route.grade,
        href: buildCragImageDestination({
          imageId: target.displayImageId,
          target: {
            climbId: target.climbId,
            routeId: target.routeId,
            climbSlug: route.slug || target.climbSlug,
            imageId: target.imageId,
          },
          routeHrefBase,
          offlineOnly: false,
        }),
        previewImageUrl: previews[route.id]?.imageUrl || target.displayImageUrl || null,
      }
    })
    .filter((route): route is CachedCragRouteSummary => route !== null)
}

export async function readShallowLocalCragClimbs(
  cragId: string,
  routeHrefBase: string,
): Promise<CachedCragRouteSummary[]> {
  const scopes = await getPreferredQueryScopes()

  for (const scope of scopes) {
    const persistedClient = await readPersistedQueryClient(scope)
    const queries = getPersistedQueries(persistedClient)
    const results = buildShallowLocalCragClimbsFromQueries(queries, cragId, routeHrefBase)

    if (results.length > 0) {
      return results
    }
  }

  return []
}
