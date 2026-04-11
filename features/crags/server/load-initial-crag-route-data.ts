import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveRouteImageUrl } from '@/lib/media/route-image-url'
import { dedupeCragRoutes, formatCragRoutes, getAverageCoordinates } from '@/features/crags/lib/crag-page-domain'
import { buildEffectiveClimbLookup } from '@/features/crags/lib/crag-route-targets'
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
  climb_id: string
  image_id: string
}

const INITIAL_CRAG_IMAGE_LIMIT = 24
const INITIAL_ROUTE_PREVIEW_LIMIT = 24
const CRAG_DEBUG_ROUTE_IDS = new Set([
  '8f450e11-55f7-40dd-b04b-e48d0061fd7b',
  '84d00fe1-44a6-48b5-b7e2-ef3205957df1',
  'e03dde44-6aef-454a-b4b1-e8237c040407',
  '1969f064-41d8-4150-b469-d09cbea993bc',
])

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
  const debugRoutes = initialRoutes.filter((route) => CRAG_DEBUG_ROUTE_IDS.has(route.id))

  if (initialRoutePreviewClimbIds.length > 0) {
    const previewRouteLineClimbIds = Array.from(new Set(
      initialRoutePreviewClimbIds.flatMap((climbId) => climbIdsByEffectiveClimbId[climbId] || [climbId])
    ))

    const { data: previewLineData } = await supabase
      .from('route_lines')
      .select('climb_id, image_id')
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

    for (const route of debugRoutes) {
      const aliasClimbIds = climbIdsByEffectiveClimbId[route.id] || [route.id]
      const candidateRows = previewLineRows.filter((row) => aliasClimbIds.includes(row.climb_id))
      const chosenPreviewImageId = firstPreviewImageIdByClimbId[route.id] || null
      console.log('[Crag SSR Preview Debug]', {
        routeId: route.id,
        routeName: route.name,
        hasTopo: route.hasTopo,
        topoImageCount: route.topoImageCount,
        aliasClimbIds,
        candidateRows: candidateRows.map((row) => ({ climbId: row.climb_id, imageId: row.image_id })),
        chosenPreviewImageId,
        previewImageInInitialImageSlice: chosenPreviewImageId ? images.some((image) => image.id === chosenPreviewImageId) : false,
        previewImageHydratedOnDemand: chosenPreviewImageId ? missingPreviewImageIds.includes(chosenPreviewImageId) : false,
        seededPreview: initialRoutePreviewByClimbId[route.id] || null,
        seededImageIds: initialRouteImageIdsByClimbId[route.id] || [],
      })
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
