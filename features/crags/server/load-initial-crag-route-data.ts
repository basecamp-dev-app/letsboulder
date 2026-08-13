import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveRouteImageUrl } from '@/lib/media/route-image-url'
import { dedupeCragRoutes, formatCragRoutes, getAverageCoordinates } from '@/features/crags/lib/crag-page-domain'
import { buildEffectiveClimbLookup, fetchCragRoutePreviewsBatched, hasCompleteRouteTargets } from '@/features/crags/lib/crag-route-targets'
import type { ClimbIdentityRow } from '@/features/crags/lib/crag-page-domain'
import type { InitialCragRouteData } from '@/features/crags/lib/crag-page-types'
import { loadPublicCragMapImages } from '@/features/crags/lib/crag-map-images'
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

function buildInitialImage(image: ImageRow, routeLinesCount = 0): HydratedImage {
  return {
    id: image.id,
    url: resolveRouteImageUrl(`/images/${image.id}/v1/detail.jpg`),
    storageUrl: image.url,
    latitude: image.latitude,
    longitude: image.longitude,
    route_lines_count: routeLinesCount,
    is_verified: false,
    verification_count: 0,
    supplementary_faces_count: 0,
  }
}

export async function loadInitialCragRouteData(
  supabase: SupabaseClient<Database>,
  cragId: string,
  cragCoords?: { latitude: number | null; longitude: number | null },
  requestId?: string,
  selectedImageId?: string | null
): Promise<InitialCragRouteData> {
  const [{ data: routeData, error: routeError }, mapImages] = await Promise.all([
    supabase.rpc('get_crag_route_intelligence', { p_crag_id: cragId }),
    loadPublicCragMapImages(supabase, cragId, { initialOnly: true }),
  ])
  if (routeError) throw routeError
  const baseRoutes = formatCragRoutes(routeData || [])

  const climbIds = baseRoutes.map((route) => route.id)
  let effectiveClimbIdByClimbId: Record<string, string> = {}

  if (climbIds.length > 0) {
    const { data, error } = await supabase
      .from('climbs')
      .select('id, shared_climb_id')
      .in('id', climbIds)
      .order('id', { ascending: true })

    if (error) throw error

    const effectiveClimbLookup = buildEffectiveClimbLookup((data || []) as ClimbIdentityRow[])
    effectiveClimbIdByClimbId = effectiveClimbLookup.effectiveClimbIdByClimbId
  }

  const routeLineCountByImageId = new Map<string, number>()
  const initialRoutes = dedupeCragRoutes(baseRoutes, effectiveClimbIdByClimbId)
  const imageById = new Map<string, HydratedImage>()

  const initialRoutePreviewByClimbId: InitialCragRouteData['initialRoutePreviewByClimbId'] = {}
  const initialRouteImageIdsByClimbId: InitialCragRouteData['initialRouteImageIdsByClimbId'] = {}
  let initialDefaultRouteTargetByImageId: InitialCragRouteData['initialDefaultRouteTargetByImageId'] = {}
  let initialRouteNavigationTargetByClimbId: InitialCragRouteData['initialRouteNavigationTargetByClimbId'] = {}
  const initialImages: HydratedImage[] = mapImages.map((image) => ({ ...image }))
  for (const image of initialImages) imageById.set(image.id, image)

  if (initialRoutes.length > 0) {
    const targetMaps = await fetchCragRoutePreviewsBatched(supabase, cragId, effectiveClimbIdByClimbId, {
      limit: undefined,
    })

    const previewImageIds = Array.from(new Set(Object.values(targetMaps.nextRoutePreviewByClimbId).map((preview) => preview.imageId)))
    const routeTargetImageIds = Array.from(new Set(Object.values(targetMaps.nextRouteImageIdsByClimbId).flat()))
    const criticalImageIds = Array.from(new Set([
      ...previewImageIds,
      ...routeTargetImageIds,
      ...(selectedImageId ? [selectedImageId] : []),
    ]))
    const missingCriticalImageIds = criticalImageIds.filter((imageId) => !imageById.has(imageId))

    if (criticalImageIds.length > 0) {
      const { data: routeLineImageData, error } = await supabase
        .from('route_lines')
        .select('image_id')
        .in('image_id', criticalImageIds)

      if (error) throw error

      for (const row of (routeLineImageData || []) as RouteLineImageRow[]) {
        if (!row.image_id) continue
        routeLineCountByImageId.set(row.image_id, (routeLineCountByImageId.get(row.image_id) || 0) + 1)
      }

      for (const imageId of criticalImageIds) {
        const existing = imageById.get(imageId)
        if (existing) existing.route_lines_count = routeLineCountByImageId.get(imageId) || 0
      }
    }

    if (missingCriticalImageIds.length > 0) {
      const { data: previewImageData, error } = await supabase
        .from('images')
        .select('id, url, latitude, longitude')
        .in('id', missingCriticalImageIds)
        .eq('crag_id', cragId)
        .eq('status', 'approved')
        .eq('processing_status', 'ready')
        .in('moderation_status', ['approved', 'skipped'])
        .eq('visibility', 'public')

      if (error) throw error

      for (const image of (previewImageData || []) as ImageRow[]) {
        const hydratedImage = buildInitialImage(image, routeLineCountByImageId.get(image.id) || 0)

        if (!imageById.has(hydratedImage.id)) {
          imageById.set(hydratedImage.id, hydratedImage)
          initialImages.push(hydratedImage)
        }
      }
    }

    for (const [routeId, imageIds] of Object.entries(targetMaps.nextRouteImageIdsByClimbId)) {
      const hydratedImageIds = imageIds.filter((imageId) => imageById.has(imageId))
      if (hydratedImageIds.length > 0) initialRouteImageIdsByClimbId[routeId] = hydratedImageIds
    }
    for (const [routeId, preview] of Object.entries(targetMaps.nextRoutePreviewByClimbId)) {
      const hydratedImage = imageById.get(preview.imageId)
      if (hydratedImage) initialRoutePreviewByClimbId[routeId] = {
        imageId: hydratedImage.id, imageUrl: hydratedImage.url, storageUrl: hydratedImage.storageUrl,
      }
    }
    initialDefaultRouteTargetByImageId = Object.fromEntries(
      Object.entries(targetMaps.nextDefaultRouteTargetByImageId)
        .filter(([imageId]) => imageById.has(imageId))
    )
    for (const [routeId, target] of Object.entries(targetMaps.nextRouteNavigationTargetByClimbId)) {
      const hydratedImage = imageById.get(target.displayImageId)
      if (hydratedImage) {
        initialRouteNavigationTargetByClimbId[routeId] = {
          ...target,
          displayImageUrl: hydratedImage.url,
          storageUrl: hydratedImage.storageUrl,
        }
      }
    }

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

    return {
      initialRoutes,
      initialRouteImageIdsByClimbId,
      initialRoutePreviewByClimbId,
      initialDefaultRouteTargetByImageId,
      initialRouteNavigationTargetByClimbId,
      initialImages,
      initialCragCenter,
      initialRouteTargetsComplete,
      initialCriticalImagesComplete: criticalImageIds.every((imageId) => imageById.has(imageId)),
      initialMapImagesComplete: false,
      loadedAt: Date.now(),
    }
  }

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

  return {
    initialRoutes,
    initialRouteImageIdsByClimbId,
    initialRoutePreviewByClimbId,
    initialDefaultRouteTargetByImageId,
    initialRouteNavigationTargetByClimbId,
    initialImages,
    initialCragCenter,
    initialRouteTargetsComplete,
    initialCriticalImagesComplete: true,
    initialMapImagesComplete: false,
    loadedAt: Date.now(),
  }
}
