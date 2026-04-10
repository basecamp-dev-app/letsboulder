import type { SupabaseClient } from '@supabase/supabase-js'
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

const INITIAL_CRAG_IMAGE_LIMIT = 24

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
    initialImagesComplete: false,
    loadedAt: Date.now(),
  }
}
