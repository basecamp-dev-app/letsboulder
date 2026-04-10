import type { SupabaseClient } from '@supabase/supabase-js'
import { buildSelectableImageIdByImageId } from '@/lib/image-identity'
import { resolveRouteImageUrl } from '@/lib/media/route-image-url'
import { dedupeCragRoutes, formatCragRoutes, getAverageCoordinates } from '@/features/crags/lib/crag-page-domain'
import type { ClimbIdentityRow } from '@/features/crags/lib/crag-page-domain'
import type { InitialCragRouteData } from '@/features/crags/lib/crag-page-types'
import type { Database } from '@/types/database'

interface ImageRow {
  id: string
  url: string
  latitude: number | null
  longitude: number | null
}

interface CragImageLinkRow {
  linked_image_id: string | null
  source_image_id: string | null
}

export async function loadInitialCragRouteData(
  supabase: SupabaseClient<Database>,
  cragId: string,
  cragCoords?: { latitude: number | null; longitude: number | null }
): Promise<InitialCragRouteData> {
  const [{ data: routeData }, { data: imageData }, { data: cragImageLinkData }] = await Promise.all([
    supabase.rpc('get_crag_route_intelligence', { p_crag_id: cragId }),
    supabase
      .from('images')
      .select('id, url, latitude, longitude')
      .eq('crag_id', cragId)
      .order('created_at', { ascending: false }),
    supabase
      .from('crag_images')
      .select('linked_image_id, source_image_id')
      .eq('crag_id', cragId)
      .order('created_at', { ascending: false }),
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

  const linkedImageIds = Array.from(new Set(((cragImageLinkData || []) as CragImageLinkRow[])
    .flatMap((row) => [row.linked_image_id, row.source_image_id])
    .filter((value): value is string => typeof value === 'string' && value.length > 0)))

  const knownImageIds = new Set(((imageData || []) as ImageRow[]).map((image) => image.id))
  const missingLinkedImageIds = linkedImageIds.filter((imageId) => !knownImageIds.has(imageId))

  let missingLinkedImages: ImageRow[] = []
  if (missingLinkedImageIds.length > 0) {
    const { data } = await supabase
      .from('images')
      .select('id, url, latitude, longitude')
      .in('id', missingLinkedImageIds)
      .order('created_at', { ascending: false })

    missingLinkedImages = (data || []) as ImageRow[]
  }

  const images = [...((imageData || []) as ImageRow[]), ...missingLinkedImages].map((image) => ({
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
  buildSelectableImageIdByImageId(
    images,
    ((cragImageLinkData || []) as CragImageLinkRow[])
  )

  const initialRoutes = dedupeCragRoutes(baseRoutes, effectiveClimbIdByClimbId)

  const withCoords = images.filter(
    (image): image is ImageRow & { latitude: number; longitude: number } => typeof image.latitude === 'number' && typeof image.longitude === 'number'
  )
  const initialCragCenter = typeof cragCoords?.latitude === 'number' && typeof cragCoords?.longitude === 'number'
    ? [cragCoords.latitude, cragCoords.longitude] as [number, number]
    : withCoords.length > 0 ? getAverageCoordinates(withCoords) : null

  return {
    initialRoutes,
    initialRouteImageIdsByClimbId: {},
    initialRoutePreviewByClimbId: {},
    initialDefaultRouteTargetByImageId: {},
    initialRouteNavigationTargetByClimbId: {},
    initialImages,
    initialCragCenter,
    initialRouteTargetsComplete: false,
    initialImagesComplete: true,
    loadedAt: Date.now(),
  }
}
