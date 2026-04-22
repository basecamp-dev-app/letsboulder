import { createClient } from '@/lib/supabase'
import { reportError } from '@/lib/errors'
import { resolveRouteImageUrl } from '@/lib/media/route-image-url'
import type { ImageRouteTarget } from '@/features/crags/lib/build-crag-image-destination'
import { getAverageCoordinates, getStoredCragClimbPayloadsSafely, hydrateOfflineCragData } from '@/features/crags/lib/crag-page-domain'
import type { CragRouteIntelligenceRow, RawImageRow } from '@/features/crags/lib/crag-page-domain'
import type { CragPageCrag, ImageData, RouteNavigationTarget, RoutePreview } from '@/features/crags/lib/crag-page-types'

export const cragKeys = {
  all: ['crag'] as const,
  byId: (id: string) => [...cragKeys.all, id] as const,
  images: (id: string) => [...cragKeys.byId(id), 'images'] as const,
  routes: (id: string) => [...cragKeys.byId(id), 'routes'] as const,
  routeTargets: (climbIdsFingerprint: string) =>
    [...cragKeys.all, 'route-targets', climbIdsFingerprint] as const,
}

function isOffline() {
  return typeof navigator !== 'undefined' && navigator.onLine === false
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

interface InitialCragImagesFallback {
  images: ImageData[]
  cragCenter: [number, number] | null
  defaultRouteTargetByImageId: Record<string, ImageRouteTarget>
  routeImageIdsByClimbId: Record<string, string[]>
  routePreviewByClimbId: Record<string, RoutePreview>
  routeNavigationTargetByClimbId: Record<string, RouteNavigationTarget>
}

function buildInitialCragImagesFallback(
  initialCrag: CragPageCrag,
  fallback: InitialCragImagesFallback
): CragImagesResult {
  return {
    crag: initialCrag,
    images: fallback.images,
    cragCenter: fallback.cragCenter,
    defaultRouteTargetByImageId: fallback.defaultRouteTargetByImageId,
    routeImageIdsByClimbId: fallback.routeImageIdsByClimbId,
    routePreviewByClimbId: fallback.routePreviewByClimbId,
    routeNavigationTargetByClimbId: fallback.routeNavigationTargetByClimbId,
  }
}

export async function fetchCragImages(
  id: string,
  initialCrag: CragPageCrag | null,
  initialFallback?: InitialCragImagesFallback
): Promise<CragImagesResult> {
  const offlinePayloads = await getStoredCragClimbPayloadsSafely(id)
  const offlineHydrated = offlinePayloads.length > 0 ? hydrateOfflineCragData(offlinePayloads) : null

  if (isOffline()) {
    if (!offlineHydrated) throw new Error('No offline data available')
    if (!initialCrag) throw new Error('Crag metadata not available offline')
    return {
      crag: initialCrag,
      images: offlineHydrated.images,
      cragCenter: offlineHydrated.cragCenter,
      defaultRouteTargetByImageId: offlineHydrated.defaultRouteTargetByImageId,
      routeImageIdsByClimbId: offlineHydrated.routeImageIdsByClimbId,
      routePreviewByClimbId: offlineHydrated.routePreviewByClimbId,
      routeNavigationTargetByClimbId: offlineHydrated.routeNavigationTargetByClimbId,
    }
  }

  const supabase = createClient()

  const imagesPromise = supabase
    .from('images')
    .select('id, url, latitude, longitude, created_at, is_verified, verification_count, route_lines(count)')
    .eq('crag_id', id)
    .order('created_at', { ascending: false })

  const supplementaryImageIdsPromise = supabase
    .from('crag_images')
    .select('linked_image_id, source_image_id, url')
    .eq('crag_id', id)
    .not('linked_image_id', 'is', null)

  const cragPromise = initialCrag
    ? Promise.resolve({ data: initialCrag, error: null as null })
    : supabase
        .from('crags')
        .select(`
          *,
          climbing_areas:region_id (id, name)
        `)
        .eq('id', id)
        .single()

  const [
    { data: cragData, error: cragError },
    { data: imagesData, error: imagesError },
    { data: supplementaryImageIdsData, error: supplementaryImageIdsError },
  ] = await Promise.all([cragPromise, imagesPromise, supplementaryImageIdsPromise])

  if (cragError || !cragData) {
    if (offlineHydrated && initialCrag) {
      return {
        crag: initialCrag,
        images: offlineHydrated.images,
        cragCenter: offlineHydrated.cragCenter,
        defaultRouteTargetByImageId: offlineHydrated.defaultRouteTargetByImageId,
        routeImageIdsByClimbId: offlineHydrated.routeImageIdsByClimbId,
        routePreviewByClimbId: offlineHydrated.routePreviewByClimbId,
        routeNavigationTargetByClimbId: offlineHydrated.routeNavigationTargetByClimbId,
      }
    }
    throw new Error(`Crag not found: ${cragError?.message}`)
  }

  if (imagesError) reportError(new Error('Error fetching images'), { message: 'Error fetching images', extra: imagesError })
  if (supplementaryImageIdsError) reportError(new Error('Error fetching supplementary image IDs'), { message: 'Error fetching supplementary image IDs', extra: supplementaryImageIdsError })

  if ((imagesError || supplementaryImageIdsError) && initialCrag && initialFallback) {
    return buildInitialCragImagesFallback(initialCrag, initialFallback)
  }

  const supplementaryImageIds = new Set<string>(
    (supplementaryImageIdsData || [])
      .flatMap((row: { linked_image_id: string | null; source_image_id?: string | null }) => [row.linked_image_id, row.source_image_id || null])
      .filter((value: string | null): value is string => typeof value === 'string' && value.length > 0)
  )

  const supplementaryImageUrls = new Set(
    (supplementaryImageIdsData || [])
      .filter((row: { source_image_id: string | null; url?: string | null }) => !!row.source_image_id)
      .map((row: { url?: string | null }) => row.url)
      .filter((value: string | null | undefined): value is string => typeof value === 'string' && value.length > 0)
  )

  const supplementaryCountByPrimaryId: Record<string, number> = {}
  for (const row of (supplementaryImageIdsData || []) as Array<{ source_image_id: string | null }>) {
    if (!row.source_image_id) continue
    supplementaryCountByPrimaryId[row.source_image_id] = (supplementaryCountByPrimaryId[row.source_image_id] || 0) + 1
  }

  const allImagesData = (imagesData || []) as RawImageRow[]
  const knownImageIds = new Set(allImagesData.map((image) => image.id))
  const missingSupplementaryImageIds = Array.from(supplementaryImageIds).filter((imageId) => !knownImageIds.has(imageId))

  let supplementaryImagesData: RawImageRow[] = []
  if (missingSupplementaryImageIds.length > 0) {
    const { data: extraImagesData, error: extraImagesError } = await supabase
      .from('images')
      .select('id, url, latitude, longitude, created_at, is_verified, verification_count, route_lines(count)')
      .in('id', missingSupplementaryImageIds)

    if (extraImagesError) reportError(new Error('Error fetching supplementary images'), { message: 'Error fetching supplementary images', extra: extraImagesError })
    else supplementaryImagesData = (extraImagesData || []) as RawImageRow[]
  }

  const mergedImagesData = [...allImagesData, ...supplementaryImagesData]

  const primaryImagesData = mergedImagesData.filter(
    (img: { id: string; url: string }) => !supplementaryImageIds.has(img.id) && !supplementaryImageUrls.has(img.url)
  )

  if (imagesError || supplementaryImageIdsError || primaryImagesData.length === 0) {
    if (offlineHydrated && initialCrag) {
      return {
        crag: initialCrag,
        images: offlineHydrated.images,
        cragCenter: offlineHydrated.cragCenter,
        defaultRouteTargetByImageId: offlineHydrated.defaultRouteTargetByImageId,
        routeImageIdsByClimbId: offlineHydrated.routeImageIdsByClimbId,
        routePreviewByClimbId: offlineHydrated.routePreviewByClimbId,
        routeNavigationTargetByClimbId: offlineHydrated.routeNavigationTargetByClimbId,
      }
    }

    if (initialCrag && initialFallback) {
      return buildInitialCragImagesFallback(initialCrag, initialFallback)
    }
  }

  const formatImageRow = (img: RawImageRow): ImageData => {
    const routeLinesCount = Array.isArray(img.route_lines) && img.route_lines[0]
      ? img.route_lines[0].count
      : 0
    return {
      id: img.id,
      url: resolveRouteImageUrl(img.url),
      storageUrl: img.url,
      latitude: img.latitude,
      longitude: img.longitude,
      created_at: img.created_at ?? null,
      is_verified: img.is_verified || false,
      verification_count: img.verification_count || 0,
      route_lines_count: routeLinesCount,
      supplementary_faces_count: supplementaryCountByPrimaryId[img.id] || 0,
    }
  }

  const formattedImages: ImageData[] = primaryImagesData.map(formatImageRow)
  const previewImages = mergedImagesData.map(formatImageRow)

  const withCoords = formattedImages.filter(
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
    images: previewImages,
    cragCenter,
    defaultRouteTargetByImageId: initialFallback?.defaultRouteTargetByImageId || {},
    routeImageIdsByClimbId: initialFallback?.routeImageIdsByClimbId || {},
    routePreviewByClimbId: initialFallback?.routePreviewByClimbId || {},
    routeNavigationTargetByClimbId: initialFallback?.routeNavigationTargetByClimbId || {},
  }
}

export interface CragRoutesResult {
  routes: import('@/features/crags/lib/crag-page-types').CragRoute[]
  effectiveClimbIdByClimbId: Record<string, string>
}

export async function fetchCragRoutes(id: string): Promise<CragRoutesResult> {
  const { createClient: createClientFn } = await import('@/lib/supabase')
  const { dedupeCragRoutes, formatCragRoutes, getStoredCragClimbPayloadsSafely: getStoredFn, hydrateOfflineCragData: hydrateFn } = await import('@/features/crags/lib/crag-page-domain')

  const offlinePayloads = await getStoredFn(id)
  const offlineHydrated = offlinePayloads.length > 0 ? hydrateFn(offlinePayloads) : null

  if (isOffline()) {
    if (!offlineHydrated) throw new Error('No offline route data available')
    return { routes: offlineHydrated.routes, effectiveClimbIdByClimbId: {} }
  }

  const supabase = createClientFn()

  const response = await supabase.rpc('get_crag_route_intelligence', { p_crag_id: id })
  const routeMetricsData = response.data
  const routeMetricsError = response.error

  if (routeMetricsError) {
    if (offlineHydrated) {
      return { routes: offlineHydrated.routes, effectiveClimbIdByClimbId: {} }
    }
    throw new Error(`Route intelligence error: ${routeMetricsError.message}`)
  }

  if (!routeMetricsData || routeMetricsData.length === 0) {
    if (offlineHydrated) {
      return { routes: offlineHydrated.routes, effectiveClimbIdByClimbId: {} }
    }
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
