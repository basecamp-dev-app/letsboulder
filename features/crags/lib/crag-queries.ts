import { createClient } from '@/lib/supabase'
import type { ImageRouteTarget } from '@/features/crags/lib/build-crag-image-destination'
import { getAverageCoordinates } from '@/features/crags/lib/crag-page-domain'
import type { CragRouteIntelligenceRow } from '@/features/crags/lib/crag-page-domain'
import type { CragPageCrag, ImageData, RouteNavigationTarget, RoutePreview } from '@/features/crags/lib/crag-page-types'
import { loadPublicCragMapImages } from '@/features/crags/lib/crag-map-images'
import { fetchCragRouteTargetPage } from '@/features/crags/lib/crag-route-targets'

export const cragKeys = {
  all: ['crag'] as const,
  byId: (id: string) => [...cragKeys.all, id] as const,
  images: (id: string) => [...cragKeys.byId(id), 'images'] as const,
  routes: (id: string) => [...cragKeys.byId(id), 'routes'] as const,
  routeTargets: (climbIdsFingerprint: string) =>
    [...cragKeys.all, 'route-targets', climbIdsFingerprint] as const,
}

export interface CragImagesResult {
  crag: CragPageCrag
  images: ImageData[]
  cragCenter: [number, number] | null
  defaultRouteTargetByImageId: Record<string, ImageRouteTarget>
  routeImageIdsByClimbId: Record<string, string[]>
  routePreviewByClimbId: Record<string, RoutePreview>
  routeNavigationTargetByClimbId: Record<string, RouteNavigationTarget>
}

export async function fetchCragImages(id: string): Promise<CragImagesResult> {
  const supabase = createClient()

  const cragPromise = supabase
    .from('crags')
    .select(`
      *,
      climbing_areas:region_id (id, name)
    `)
    .eq('id', id)
    .single()

  const [
    { data: cragData, error: cragError },
    imagesData,
    targetMaps,
  ] = await Promise.all([
    cragPromise,
    loadPublicCragMapImages(supabase, id),
    fetchCragRouteTargetPage(supabase, id, 1000000, 0),
  ])

  if (cragError || !cragData) {
    throw new Error(`Crag not found: ${cragError?.message}`)
  }

  const withCoords = imagesData.filter(
    (img): img is ImageData & { latitude: number; longitude: number } => img.latitude !== null && img.longitude !== null
  )
  let cragCenter: [number, number] | null = null
  if (typeof cragData.latitude === 'number' && typeof cragData.longitude === 'number') {
    cragCenter = [cragData.latitude, cragData.longitude]
  } else if (withCoords.length > 0) {
    cragCenter = getAverageCoordinates(withCoords)
  }

  return {
    crag: cragData,
    images: imagesData,
    cragCenter,
    defaultRouteTargetByImageId: targetMaps.nextDefaultRouteTargetByImageId,
    routeImageIdsByClimbId: targetMaps.nextRouteImageIdsByClimbId,
    routePreviewByClimbId: targetMaps.nextRoutePreviewByClimbId,
    routeNavigationTargetByClimbId: targetMaps.nextRouteNavigationTargetByClimbId,
  }
}

export interface CragRoutesResult {
  routes: import('@/features/crags/lib/crag-page-types').CragRoute[]
  effectiveClimbIdByClimbId: Record<string, string>
}

export async function fetchCragRoutes(id: string): Promise<CragRoutesResult> {
  const { createClient: createClientFn } = await import('@/lib/supabase')
  const { dedupeCragRoutes, formatCragRoutes } = await import('@/features/crags/lib/crag-page-domain')

  const supabase = createClientFn()

  const response = await supabase.rpc('get_crag_route_intelligence', { p_crag_id: id })
  const routeMetricsData = response.data
  const routeMetricsError = response.error

  if (routeMetricsError) {
    throw new Error(`Route intelligence error: ${routeMetricsError.message}`)
  }

  if (!routeMetricsData || routeMetricsData.length === 0) {
    return { routes: [], effectiveClimbIdByClimbId: {} }
  }

  const routeRows = routeMetricsData as CragRouteIntelligenceRow[]
  const climbIds = routeRows.map((route: CragRouteIntelligenceRow) => route.id)

  let effectiveClimbData = null
  if (climbIds.length > 0) {
    const effectiveClimbResponse = await supabase
      .from('climbs')
      .select('id, shared_climb_id')
      .in('id', climbIds)
    effectiveClimbData = effectiveClimbResponse.data
  }

  const effectiveClimbIdByClimbId = Object.fromEntries(
    ((effectiveClimbData || []) as Array<{ id: string; shared_climb_id: string | null }>).map((row) => [row.id, row.shared_climb_id || row.id])
  )

  const nextRoutes = formatCragRoutes(routeMetricsData as CragRouteIntelligenceRow[] | null | undefined)

  return {
    routes: dedupeCragRoutes(nextRoutes, effectiveClimbIdByClimbId),
    effectiveClimbIdByClimbId,
  }
}
