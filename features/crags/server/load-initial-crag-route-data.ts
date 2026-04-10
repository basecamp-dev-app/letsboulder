import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveRouteImageUrl } from '@/lib/media/route-image-url'
import { dedupeCragRoutes, formatCragRoutes, getAverageCoordinates, fetchRouteTargetMapsForClimbIds, remapRoutePreviewsByEffectiveClimbId } from '@/features/crags/lib/crag-page-domain'
import type { ClimbIdentityRow } from '@/features/crags/lib/crag-page-domain'
import type { InitialCragRouteData } from '@/features/crags/lib/crag-page-types'
import type { Database } from '@/types/database'

interface ImageRow {
  id: string
  url: string
  latitude: number | null
  longitude: number | null
}

const INITIAL_CRAG_IMAGE_LIMIT = 24
const INITIAL_ROUTE_PREVIEW_LIMIT = 24

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

    effectiveClimbIdByClimbId = Object.fromEntries(
      ((data || []) as ClimbIdentityRow[]).map((row) => [row.id, row.shared_climb_id || row.id])
    )
  }

  const images = ((imageData || []) as ImageRow[]).map((image) => ({
    ...image,
    url: resolveRouteImageUrl(image.url),
  }))
  const initialImages = images.map((image) => ({
    id: image.id,
    url: image.url,
    latitude: image.latitude,
    longitude: image.longitude,
    route_lines_count: 0,
    is_verified: false,
    verification_count: 0,
    supplementary_faces_count: 0,
  }))
  const initialRoutes = dedupeCragRoutes(baseRoutes, effectiveClimbIdByClimbId)
  const initialRoutePreviewClimbIds = initialRoutes.slice(0, INITIAL_ROUTE_PREVIEW_LIMIT).map((route) => route.id)
  const imageById = new Map(initialImages.map((image) => [image.id, image] as const))

  let initialRoutePreviewByClimbId: InitialCragRouteData['initialRoutePreviewByClimbId'] = {}
  let initialRouteImageIdsByClimbId: InitialCragRouteData['initialRouteImageIdsByClimbId'] = {}

  if (initialRoutePreviewClimbIds.length > 0) {
    const { targetMaps } = await fetchRouteTargetMapsForClimbIds(supabase, initialRoutePreviewClimbIds, imageById)
    const previewImageIds = Array.from(new Set(Object.values(targetMaps.nextRoutePreviewByClimbId).map((preview) => preview.imageId)))
    const missingPreviewImageIds = previewImageIds.filter((imageId) => !imageById.has(imageId))

    if (missingPreviewImageIds.length > 0) {
      const { data: previewImageData } = await supabase
        .from('images')
        .select('id, url, latitude, longitude')
        .in('id', missingPreviewImageIds)

      for (const image of (previewImageData || []) as ImageRow[]) {
        const hydratedImage = {
          id: image.id,
          url: resolveRouteImageUrl(image.url),
          latitude: image.latitude,
          longitude: image.longitude,
          route_lines_count: 0,
          is_verified: false,
          verification_count: 0,
          supplementary_faces_count: 0,
        }
        imageById.set(hydratedImage.id, hydratedImage)
        if (!initialImages.some((existingImage) => existingImage.id === hydratedImage.id)) {
          initialImages.push(hydratedImage)
        }
      }

      const hydratedTargetMaps = await fetchRouteTargetMapsForClimbIds(supabase, initialRoutePreviewClimbIds, imageById)
      initialRoutePreviewByClimbId = remapRoutePreviewsByEffectiveClimbId(
        hydratedTargetMaps.targetMaps.nextRoutePreviewByClimbId,
        effectiveClimbIdByClimbId
      )
      initialRouteImageIdsByClimbId = hydratedTargetMaps.targetMaps.nextRouteImageIdsByClimbId
    } else {
      initialRoutePreviewByClimbId = remapRoutePreviewsByEffectiveClimbId(
        targetMaps.nextRoutePreviewByClimbId,
        effectiveClimbIdByClimbId
      )
      initialRouteImageIdsByClimbId = targetMaps.nextRouteImageIdsByClimbId
    }
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
    initialDefaultRouteTargetByImageId: {},
    initialRouteNavigationTargetByClimbId: {},
    initialImages,
    initialCragCenter,
    initialRouteTargetsComplete: false,
    initialImagesComplete: false,
    loadedAt: Date.now(),
  }
}
