import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveRouteImageUrl } from '@/lib/media/route-image-url'
import { getAdminClientWithAudit } from '@/lib/supabase-admin'
import { dedupeCragRoutes, formatCragRoutes, getAverageCoordinates } from '@/features/crags/lib/crag-page-domain'
import { buildEffectiveClimbLookup, fetchCragRoutePreviewsBatched, hasCompleteRouteTargets } from '@/features/crags/lib/crag-route-targets'
import type { ClimbIdentityRow } from '@/features/crags/lib/crag-page-domain'
import type { InitialCragRouteData } from '@/features/crags/lib/crag-page-types'
import type { Database } from '@/types/database'

interface ImageRow {
  id: string
  url: string
  latitude: number | null
  longitude: number | null
}

interface RouteLineImageRow {
  image_id: string | null
}

interface HydratedImage {
  id: string
  url: string
  storageUrl?: string
  latitude: number | null
  longitude: number | null
  route_lines_count: number
  is_verified: boolean
  verification_count: number
  supplementary_faces_count: number
}

const INITIAL_CRAG_IMAGE_LIMIT = 24
const SSR_ROUTE_PREVIEW_SEED_LIMIT = 100

export async function loadInitialCragRouteData(
  supabase: SupabaseClient<Database>,
  cragId: string,
  cragCoords?: { latitude: number | null; longitude: number | null },
  requestId?: string
): Promise<InitialCragRouteData> {
  const startedAt = Date.now()
  // eslint-disable-next-line no-console
  console.log('CRAG_DEBUG', {
    stage: 'load_initial_crag_route_data:start',
    requestId: requestId || null,
    cragId,
    hasCragCoords: typeof cragCoords?.latitude === 'number' && typeof cragCoords?.longitude === 'number',
  })

  const [{ data: routeData }, { data: imageData }] = await Promise.all([
    supabase.rpc('get_crag_route_intelligence', { p_crag_id: cragId }),
    supabase
      .from('images')
      .select('id, url, latitude, longitude')
      .eq('crag_id', cragId)
      .order('created_at', { ascending: false })
      .limit(INITIAL_CRAG_IMAGE_LIMIT),
  ])
  const baseRoutes = formatCragRoutes(routeData || [])
  // eslint-disable-next-line no-console
  console.log('CRAG_DEBUG', {
    stage: 'load_initial_crag_route_data:seed_base',
    requestId: requestId || null,
    cragId,
    routeRpcCount: routeData?.length || 0,
    baseRoutesCount: baseRoutes.length,
    initialSeedImageCount: imageData?.length || 0,
    durationMs: Date.now() - startedAt,
  })

  const climbIds = baseRoutes.map((route) => route.id)
  let effectiveClimbIdByClimbId: Record<string, string> = {}

  if (climbIds.length > 0) {
    const { data } = await supabase
      .from('climbs')
      .select('id, shared_climb_id')
      .in('id', climbIds)
      .order('id', { ascending: true })

    const effectiveClimbLookup = buildEffectiveClimbLookup((data || []) as ClimbIdentityRow[])
    effectiveClimbIdByClimbId = effectiveClimbLookup.effectiveClimbIdByClimbId
    // eslint-disable-next-line no-console
    console.log('CRAG_DEBUG', {
      stage: 'load_initial_crag_route_data:effective_climbs',
      requestId: requestId || null,
      cragId,
      climbIdsCount: climbIds.length,
      effectiveClimbIdsCount: Object.keys(effectiveClimbIdByClimbId).length,
      durationMs: Date.now() - startedAt,
    })
  }

  const images = ((imageData || []) as ImageRow[]).map((image) => ({
    ...image,
    url: resolveRouteImageUrl(image.url),
    storageUrl: image.url,
  }))
  const initialImageIds = new Set(images.map((image) => image.id))
  const routeLineCountByImageId = new Map<string, number>()
  const initialRoutes = dedupeCragRoutes(baseRoutes, effectiveClimbIdByClimbId)
  const imageById = new Map<string, HydratedImage>()

  const initialRoutePreviewByClimbId: InitialCragRouteData['initialRoutePreviewByClimbId'] = {}
  const initialRouteImageIdsByClimbId: InitialCragRouteData['initialRouteImageIdsByClimbId'] = {}
  let initialDefaultRouteTargetByImageId: InitialCragRouteData['initialDefaultRouteTargetByImageId'] = {}
  let initialRouteNavigationTargetByClimbId: InitialCragRouteData['initialRouteNavigationTargetByClimbId'] = {}
  let previewImagesHydrated = true
  const initialImages = images.map((image) => ({
    id: image.id,
    url: image.url,
    storageUrl: image.storageUrl,
    latitude: image.latitude,
    longitude: image.longitude,
    route_lines_count: 0,
    is_verified: false,
    verification_count: 0,
    supplementary_faces_count: 0,
  }))

  for (const image of initialImages) {
    imageById.set(image.id, image)
  }

  if (initialRoutes.length > 0) {
    if (initialImageIds.size > 0) {
      const { data: initialRouteLineImageData } = await supabase
        .from('route_lines')
        .select('image_id')
        .in('image_id', Array.from(initialImageIds))

      for (const row of (initialRouteLineImageData || []) as RouteLineImageRow[]) {
        if (!row.image_id) continue
        routeLineCountByImageId.set(row.image_id, (routeLineCountByImageId.get(row.image_id) || 0) + 1)
      }
    }

    for (const image of initialImages) {
      image.route_lines_count = routeLineCountByImageId.get(image.id) || 0
    }

    const previewSupabase = getAdminClientWithAudit('loadInitialCragRouteData preview seed')
    const targetMaps = await fetchCragRoutePreviewsBatched(previewSupabase, cragId, effectiveClimbIdByClimbId, {
      limit: SSR_ROUTE_PREVIEW_SEED_LIMIT,
    })

    const previewImageIds = Array.from(new Set(Object.values(targetMaps.nextRoutePreviewByClimbId).map((preview) => preview.imageId)))
    const missingPreviewImageIds = previewImageIds.filter((imageId) => !imageById.has(imageId))
    const previewOnlyImageIds = previewImageIds.filter((imageId) => !initialImageIds.has(imageId))
    // eslint-disable-next-line no-console
    console.log('CRAG_DEBUG', {
      stage: 'load_initial_crag_route_data:preview_seed',
      requestId: requestId || null,
      cragId,
      dedupedRoutesCount: initialRoutes.length,
      previewCount: previewImageIds.length,
      previewOnlyImageCount: previewOnlyImageIds.length,
      missingPreviewImageCount: missingPreviewImageIds.length,
      durationMs: Date.now() - startedAt,
    })

    if (previewOnlyImageIds.length > 0) {
      const { data: routeLineImageData } = await previewSupabase
        .from('route_lines')
        .select('image_id')
        .in('image_id', previewOnlyImageIds)

      for (const row of (routeLineImageData || []) as RouteLineImageRow[]) {
        if (!row.image_id) continue
        routeLineCountByImageId.set(row.image_id, (routeLineCountByImageId.get(row.image_id) || 0) + 1)
      }
    }

    if (missingPreviewImageIds.length > 0) {
      const { data: previewImageData } = await previewSupabase
        .from('images')
        .select('id, url, latitude, longitude')
        .in('id', missingPreviewImageIds)

      for (const image of (previewImageData || []) as ImageRow[]) {
        const hydratedImage = {
          id: image.id,
          url: resolveRouteImageUrl(image.url),
          storageUrl: image.url,
          latitude: image.latitude,
          longitude: image.longitude,
          route_lines_count: routeLineCountByImageId.get(image.id) || 0,
          is_verified: false,
          verification_count: 0,
          supplementary_faces_count: 0,
        }

        if (!imageById.has(hydratedImage.id)) {
          imageById.set(hydratedImage.id, hydratedImage)
          initialImages.push(hydratedImage)
        }
      }
    }

    // The SSR payload is complete once every seeded preview image has been hydrated into initialImages.
    previewImagesHydrated = previewImageIds.every((imageId) => imageById.has(imageId))

    Object.assign(initialRouteImageIdsByClimbId, targetMaps.nextRouteImageIdsByClimbId)
    Object.assign(initialRoutePreviewByClimbId, Object.fromEntries(
      Object.entries(targetMaps.nextRoutePreviewByClimbId).map(([routeId, preview]) => {
        const hydratedPreview = imageById.get(preview.imageId)
        return [routeId, hydratedPreview ? { imageId: hydratedPreview.id, imageUrl: hydratedPreview.url, storageUrl: hydratedPreview.storageUrl } : preview]
      })
    ))
    initialDefaultRouteTargetByImageId = targetMaps.nextDefaultRouteTargetByImageId
    initialRouteNavigationTargetByClimbId = Object.fromEntries(
      Object.entries(targetMaps.nextRouteNavigationTargetByClimbId).map(([routeId, target]) => {
        const hydratedImage = imageById.get(target.displayImageId)
        return [routeId, hydratedImage ? { ...target, displayImageUrl: hydratedImage.url, storageUrl: hydratedImage.storageUrl } : target]
      })
    )

    const withCoords: { latitude: number; longitude: number }[] = []
  for (const image of initialImages) {
    if (typeof image.latitude === 'number' && typeof image.longitude === 'number') {
      withCoords.push({ latitude: image.latitude, longitude: image.longitude })
    }
  }
    const initialCragCenter = typeof cragCoords?.latitude === 'number' && typeof cragCoords?.longitude === 'number'
      ? [cragCoords.latitude, cragCoords.longitude] as [number, number]
      : withCoords.length > 0 ? getAverageCoordinates(withCoords) : null

    const initialRouteTargetsComplete = hasCompleteRouteTargets(
      initialRoutes,
      initialRouteImageIdsByClimbId,
      initialRoutePreviewByClimbId,
      initialRouteNavigationTargetByClimbId
    )

    // eslint-disable-next-line no-console
    console.log('CRAG_DEBUG', {
      stage: 'load_initial_crag_route_data:return',
      requestId: requestId || null,
      cragId,
      initialRoutesCount: initialRoutes.length,
      initialImagesCount: initialImages.length,
      previewImagesHydrated,
      initialRouteTargetsComplete,
      initialImagesComplete: previewImagesHydrated,
      initialCragCenterSource: typeof cragCoords?.latitude === 'number' && typeof cragCoords?.longitude === 'number'
        ? 'crag_coords'
        : withCoords.length > 0 ? 'average_image_coords' : 'none',
      durationMs: Date.now() - startedAt,
    })

    return {
      initialRoutes,
      initialRouteImageIdsByClimbId,
      initialRoutePreviewByClimbId,
      initialDefaultRouteTargetByImageId,
      initialRouteNavigationTargetByClimbId,
      initialImages,
      initialCragCenter,
      initialRouteTargetsComplete,
      initialImagesComplete: previewImagesHydrated,
      loadedAt: Date.now(),
    }
  }

  const withCoords: { latitude: number; longitude: number }[] = []
  for (const image of images) {
    if (typeof image.latitude === 'number' && typeof image.longitude === 'number') {
      withCoords.push({ latitude: image.latitude, longitude: image.longitude })
    }
  }
  const initialCragCenter = typeof cragCoords?.latitude === 'number' && typeof cragCoords?.longitude === 'number'
    ? [cragCoords.latitude, cragCoords.longitude] as [number, number]
    : withCoords.length > 0 ? getAverageCoordinates(withCoords) : null

  const initialRouteTargetsComplete = hasCompleteRouteTargets(
    initialRoutes,
    initialRouteImageIdsByClimbId,
    initialRoutePreviewByClimbId,
    initialRouteNavigationTargetByClimbId
  )

  // eslint-disable-next-line no-console
  console.log('CRAG_DEBUG', {
    stage: 'load_initial_crag_route_data:return_no_routes',
    requestId: requestId || null,
    cragId,
    initialRoutesCount: initialRoutes.length,
    initialImagesCount: initialImages.length,
    previewImagesHydrated,
    initialRouteTargetsComplete,
    initialImagesComplete: previewImagesHydrated,
    initialCragCenterSource: typeof cragCoords?.latitude === 'number' && typeof cragCoords?.longitude === 'number'
      ? 'crag_coords'
      : withCoords.length > 0 ? 'average_image_coords' : 'none',
    durationMs: Date.now() - startedAt,
  })

  return {
    initialRoutes,
    initialRouteImageIdsByClimbId,
    initialRoutePreviewByClimbId,
    initialDefaultRouteTargetByImageId,
    initialRouteNavigationTargetByClimbId,
    initialImages,
    initialCragCenter,
    initialRouteTargetsComplete,
    initialImagesComplete: previewImagesHydrated,
    loadedAt: Date.now(),
  }
}
