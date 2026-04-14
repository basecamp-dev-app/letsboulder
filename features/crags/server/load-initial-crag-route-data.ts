import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveRouteImageUrl } from '@/lib/media/route-image-url'
import { getAdminClientWithAudit } from '@/lib/supabase-server'
import { dedupeCragRoutes, formatCragRoutes, getAverageCoordinates } from '@/features/crags/lib/crag-page-domain'
import { buildEffectiveClimbLookup, buildRouteTargetMaps, hasCompleteRouteTargets } from '@/features/crags/lib/crag-route-targets'
import type { ClimbIdentityRow } from '@/features/crags/lib/crag-page-domain'
import type { InitialCragRouteData } from '@/features/crags/lib/crag-page-types'
import type { Database } from '@/types/database'

interface ImageRow {
  id: string
  url: string
  latitude: number | null
  longitude: number | null
}

interface RoutePreviewLineRow {
  id: string
  climb_id: string
  image_id: string
  climbs: { slug: string | null } | Array<{ slug: string | null }> | null
  images: { url: string | null } | Array<{ url: string | null }> | null
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
  let climbIdsByEffectiveClimbId: Record<string, string[]> = {}

  if (climbIds.length > 0) {
    const { data } = await supabase
      .from('climbs')
      .select('id, shared_climb_id')
      .in('id', climbIds)
      .order('id', { ascending: true })

    const effectiveClimbLookup = buildEffectiveClimbLookup((data || []) as ClimbIdentityRow[])
    effectiveClimbIdByClimbId = effectiveClimbLookup.effectiveClimbIdByClimbId
    climbIdsByEffectiveClimbId = effectiveClimbLookup.climbIdsByEffectiveClimbId
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

  const initialRoutePreviewByClimbId: InitialCragRouteData['initialRoutePreviewByClimbId'] = {}
  const initialRouteImageIdsByClimbId: InitialCragRouteData['initialRouteImageIdsByClimbId'] = {}
  let initialDefaultRouteTargetByImageId: InitialCragRouteData['initialDefaultRouteTargetByImageId'] = {}
  let initialRouteNavigationTargetByClimbId: InitialCragRouteData['initialRouteNavigationTargetByClimbId'] = {}

  if (initialRoutePreviewClimbIds.length > 0) {
    const previewSupabase = getAdminClientWithAudit('loadInitialCragRouteData preview seed')
    const previewRouteLineClimbIds = Array.from(new Set(
      initialRoutePreviewClimbIds.flatMap((climbId) => climbIdsByEffectiveClimbId[climbId] || [climbId])
    ))

    const { data: previewLineData } = await previewSupabase
      .from('route_lines')
      .select('id, climb_id, image_id, climbs(slug), images(url)')
      .in('climb_id', previewRouteLineClimbIds)
      .order('sequence_order', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true })

    const previewLineRows = (previewLineData || []) as RoutePreviewLineRow[]
    const previewImageIdsByClimbId: Record<string, string[]> = {}
    const firstPreviewImageIdByClimbId: Record<string, string> = {}

    for (const row of previewLineRows) {
      const effectiveClimbId = effectiveClimbIdByClimbId[row.climb_id] || row.climb_id
      const previewImageIds = previewImageIdsByClimbId[effectiveClimbId] || []
      if (!previewImageIds.includes(row.image_id)) {
        previewImageIds.push(row.image_id)
        previewImageIdsByClimbId[effectiveClimbId] = previewImageIds
      }
      if (!firstPreviewImageIdByClimbId[effectiveClimbId]) {
        firstPreviewImageIdByClimbId[effectiveClimbId] = row.image_id
      }
    }

    const previewImageIds = Array.from(new Set(Object.values(firstPreviewImageIdByClimbId)))
    const missingPreviewImageIds = previewImageIds.filter((imageId) => !imageById.has(imageId))

    if (missingPreviewImageIds.length > 0) {
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
    }

    for (const routeId of initialRoutePreviewClimbIds) {
      const previewImageIds = previewImageIdsByClimbId[routeId]
      if (previewImageIds?.length) {
        initialRouteImageIdsByClimbId[routeId] = previewImageIds
      }

      const previewImageId = firstPreviewImageIdByClimbId[routeId]
      if (!previewImageId) continue

      const previewImage = imageById.get(previewImageId)
      if (!previewImage) continue

      initialRoutePreviewByClimbId[routeId] = {
        imageId: previewImage.id,
        imageUrl: previewImage.url,
      }
    }

    const targetMaps = buildRouteTargetMaps(
      previewLineRows,
      effectiveClimbIdByClimbId,
      imageById
    )

    initialDefaultRouteTargetByImageId = targetMaps.nextDefaultRouteTargetByImageId
    initialRouteNavigationTargetByClimbId = targetMaps.nextRouteNavigationTargetByClimbId
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
    initialImagesComplete: false,
    loadedAt: Date.now(),
  }
}
