import { buildSelectableImageIdByImageId } from '@/lib/image-identity'
import { resolveRouteImageUrl } from '@/lib/media/route-image-url'
import { dedupeCragRoutes, formatCragRoutes, getAverageCoordinates, remapRoutePreviewsByEffectiveClimbId } from '@/features/crags/lib/crag-page-domain'
import type { ClimbIdentityRow } from '@/features/crags/lib/crag-page-domain'
import type { RoutePreview } from '@/features/crags/lib/crag-page-types'
import type { Database } from '@/types/database'

type SupabaseClientLike = {
  rpc: (fn: 'get_crag_route_intelligence', args: { p_crag_id: string }) => Promise<{ data: Database['public']['Functions']['get_crag_route_intelligence']['Returns'] | null; error: unknown }>
  from: (table: 'images' | 'route_lines' | 'crag_images' | 'climbs') => {
    select: (query: string) => {
      eq: (column: string, value: string) => {
        order: (column: string, options?: { ascending?: boolean; nullsFirst?: boolean }) => OrderedQueryResult
      }
      in: (column: string, values: string[]) => {
        order: (column: string, options?: { ascending?: boolean; nullsFirst?: boolean }) => OrderedQueryResult
      }
    }
  }
}

type OrderedQueryResult = Promise<{ data: unknown[] | null; error: unknown }> & {
  order: (column: string, options?: { ascending?: boolean; nullsFirst?: boolean }) => OrderedQueryResult
}

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

interface RouteLineTargetRow {
  image_id: string
  climb_id: string
}

export async function loadInitialCragRouteData(supabase: SupabaseClientLike, cragId: string, cragCoords?: { latitude: number | null; longitude: number | null }) {
  const { data: routeData } = await supabase.rpc('get_crag_route_intelligence', { p_crag_id: cragId })
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

  const { data: imageData } = await supabase
    .from('images')
    .select('id, url, latitude, longitude')
    .eq('crag_id', cragId)
    .order('created_at', { ascending: false })

  const { data: cragImageLinkData } = await supabase
    .from('crag_images')
    .select('linked_image_id, source_image_id')
    .eq('crag_id', cragId)
    .order('created_at', { ascending: false })

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
  const selectableImageIdByImageId = buildSelectableImageIdByImageId(
    images,
    ((cragImageLinkData || []) as CragImageLinkRow[])
  )

  const imageById = new Map(images.map((image) => [image.id, image]))
  const imageIds = images.map((image) => image.id)
  const initialRoutePreviewByClimbId: Record<string, RoutePreview> = {}
  const initialRouteImageIdsByClimbId: Record<string, string[]> = {}

  if (imageIds.length > 0) {
    const { data: routeLineData } = await supabase
      .from('route_lines')
      .select('image_id, climb_id')
      .in('image_id', imageIds)
      .order('image_id', { ascending: true })
      .order('sequence_order', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true })

    for (const row of (routeLineData || []) as RouteLineTargetRow[]) {
      const effectiveClimbId = effectiveClimbIdByClimbId[row.climb_id] || row.climb_id
      const selectableImageId = selectableImageIdByImageId[row.image_id] || row.image_id
      const climbImageIds = initialRouteImageIdsByClimbId[effectiveClimbId] || []
      if (!climbImageIds.includes(selectableImageId)) {
        climbImageIds.push(selectableImageId)
        initialRouteImageIdsByClimbId[effectiveClimbId] = climbImageIds
      }
      if (initialRoutePreviewByClimbId[row.climb_id]) continue
      const image = imageById.get(selectableImageId)
      if (!image) continue
      initialRoutePreviewByClimbId[row.climb_id] = {
        imageId: selectableImageId,
        imageUrl: image.url,
      }
    }
  }

  const initialRoutes = dedupeCragRoutes(baseRoutes, effectiveClimbIdByClimbId)
  const dedupedRoutePreviewByClimbId = remapRoutePreviewsByEffectiveClimbId(initialRoutePreviewByClimbId, effectiveClimbIdByClimbId)

  const withCoords = images.filter(
    (image): image is ImageRow & { latitude: number; longitude: number } => typeof image.latitude === 'number' && typeof image.longitude === 'number'
  )
  const initialCragCenter = typeof cragCoords?.latitude === 'number' && typeof cragCoords?.longitude === 'number'
    ? [cragCoords.latitude, cragCoords.longitude] as [number, number]
    : withCoords.length > 0 ? getAverageCoordinates(withCoords) : null

  return {
    initialRoutes,
    initialRouteImageIdsByClimbId,
    initialRoutePreviewByClimbId: dedupedRoutePreviewByClimbId,
    initialImages: images.map((image) => ({
      id: image.id,
      url: image.url,
      latitude: image.latitude,
      longitude: image.longitude,
      route_lines_count: 0,
      is_verified: false,
      verification_count: 0,
      supplementary_faces_count: 0,
    })),
    initialCragCenter,
  }
}
