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

const INITIAL_CRAG_IMAGE_LIMIT = 24
const SSR_ROUTE_PREVIEW_SEED_LIMIT = 100

export async function loadInitialCragRouteData(
  supabase: SupabaseClient<Database>,
  cragId: string,
  cragCoords?: { latitude: number | null; longitude: number | null }
): Promise<InitialCragRouteData> {
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
  }

  const images = ((imageData || []) as ImageRow[]).map((image) => ({
    ...image,
    url: resolveRouteImageUrl(image.url),
  }))
  const initialImageIds = new Set(images.map((image) => image.id))
  const routeLineCountByImageId = new Map<string, number>()

  if (images.length > 0) {
    const { data: routeLineImageData } = await supabase
      .from('route_lines')
      .select('image_id')
      .in('image_id', images.map((image) => image.id))

    for (const row of (routeLineImageData || []) as RouteLineImageRow[]) {
      if (!row.image_id) continue
      routeLineCountByImageId.set(row.image_id, (routeLineCountByImageId.get(row.image_id) || 0) + 1)
    }
  }

  const initialImages = images.map((image) => ({
    id: image.id,
    url: image.url,
    latitude: image.latitude,
    longitude: image.longitude,
    route_lines_count: routeLineCountByImageId.get(image.id) || 0,
    is_verified: false,
    verification_count: 0,
    supplementary_faces_count: 0,
  }))
  const initialRoutes = dedupeCragRoutes(baseRoutes, effectiveClimbIdByClimbId)
  const imageById = new Map(initialImages.map((image) => [image.id, image] as const))

  const initialRoutePreviewByClimbId: InitialCragRouteData['initialRoutePreviewByClimbId'] = {}
  const initialRouteImageIdsByClimbId: InitialCragRouteData['initialRouteImageIdsByClimbId'] = {}
  let initialDefaultRouteTargetByImageId: InitialCragRouteData['initialDefaultRouteTargetByImageId'] = {}
  let initialRouteNavigationTargetByClimbId: InitialCragRouteData['initialRouteNavigationTargetByClimbId'] = {}
  let previewImagesHydrated = true

  if (initialRoutes.length > 0) {
    const previewSupabase = getAdminClientWithAudit('loadInitialCragRouteData preview seed')
    const targetMaps = await fetchCragRoutePreviewsBatched(previewSupabase, cragId, effectiveClimbIdByClimbId, {
      limit: SSR_ROUTE_PREVIEW_SEED_LIMIT,
    })

    const previewImageIds = Array.from(new Set(Object.values(targetMaps.nextRoutePreviewByClimbId).map((preview) => preview.imageId)))
    const missingPreviewImageIds = previewImageIds.filter((imageId) => !imageById.has(imageId))
    previewImagesHydrated = missingPreviewImageIds.every((imageId) => initialImageIds.has(imageId))

    if (missingPreviewImageIds.length > 0) {
      const { data: previewRouteLineData } = await previewSupabase
        .from('route_lines')
        .select('image_id')
        .in('image_id', missingPreviewImageIds)

      for (const row of (previewRouteLineData || []) as RouteLineImageRow[]) {
        if (!row.image_id) continue
        routeLineCountByImageId.set(row.image_id, (routeLineCountByImageId.get(row.image_id) || 0) + 1)
      }

      const { data: previewImageData } = await previewSupabase
        .from('images')
        .select('id, url, latitude, longitude')
        .in('id', missingPreviewImageIds)

      for (const image of (previewImageData || []) as ImageRow[]) {
        const hydratedImage = {
          id: image.id,
          url: resolveRouteImageUrl(image.url),
          latitude: image.latitude,
          longitude: image.longitude,
          route_lines_count: routeLineCountByImageId.get(image.id) || 0,
          is_verified: false,
          verification_count: 0,
          supplementary_faces_count: 0,
        }
        imageById.set(hydratedImage.id, hydratedImage)
        if (!initialImages.some((existingImage) => existingImage.id === hydratedImage.id)) {
          initialImages.push(hydratedImage)
        }
      }
    }

    Object.assign(initialRouteImageIdsByClimbId, targetMaps.nextRouteImageIdsByClimbId)
    Object.assign(initialRoutePreviewByClimbId, Object.fromEntries(
      Object.entries(targetMaps.nextRoutePreviewByClimbId).map(([routeId, preview]) => {
        const hydratedPreview = imageById.get(preview.imageId)
        return [routeId, hydratedPreview ? { imageId: hydratedPreview.id, imageUrl: hydratedPreview.url } : preview]
      })
    ))
    initialDefaultRouteTargetByImageId = targetMaps.nextDefaultRouteTargetByImageId
    initialRouteNavigationTargetByClimbId = Object.fromEntries(
      Object.entries(targetMaps.nextRouteNavigationTargetByClimbId).map(([routeId, target]) => {
        const hydratedImage = imageById.get(target.displayImageId)
        return [routeId, hydratedImage ? { ...target, displayImageUrl: hydratedImage.url } : target]
      })
    )
  }

  const withCoords = images.filter(
    (image): image is ImageRow & { latitude: number; longitude: number } => typeof image.latitude === 'number' && typeof image.longitude === 'number'
  )
  const initialCragCenter = typeof cragCoords?.latitude === 'number' && typeof cragCoords?.longitude === 'number'
    ? [cragCoords.latitude, cragCoords.longitude] as [number, number]
    : withCoords.length > 0 ? getAverageCoordinates(withCoords) : null

  return {
    initialRoutes,
    initialRouteImageIdsByClimbId,
    initialRoutePreviewByClimbId,
    initialDefaultRouteTargetByImageId,
    initialRouteNavigationTargetByClimbId,
    initialImages,
    initialCragCenter,
    initialRouteTargetsComplete: hasCompleteRouteTargets(
      initialRoutes,
      initialRouteImageIdsByClimbId,
      initialRoutePreviewByClimbId,
      initialRouteNavigationTargetByClimbId
    ),
    initialImagesComplete: previewImagesHydrated,
    loadedAt: Date.now(),
  }
}
