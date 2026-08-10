import { normalizeGrade } from '@/lib/grades'
import { resolveRouteImageUrl } from '@/lib/media/route-image-url'
import type { Database } from '@/types/database'

const FACE_DIRECTIONS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const
const faceDirectionIndex = new Map(FACE_DIRECTIONS.map((direction, index) => [direction, index]))

export interface CanonicalImageRow {
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

interface ClimbIdentityRow {
  id: string
  shared_climb_id: string | null
}

type CragRouteIntelligenceRow = Database['public']['Functions']['get_crag_route_intelligence']['Returns'][number]

export interface CanonicalCragRoute {
  id: string
  name: string
  grade: string
  slug: string | null
  routeType: string | null
  directions: string[]
  hasTopo: boolean
  topoImageCount: number
  ratingAvg: number | null
  ratingCount: number
  weightedRating: number | null
  sendCount: number
  recentSendCount60d: number
}

export interface CanonicalRoutePreview {
  imageId: string
  imageUrl: string
}

type OrderedQueryResult = Promise<{ data: unknown[] | null; error: unknown }> & {
  order: (column: string, options?: { ascending?: boolean; nullsFirst?: boolean }) => OrderedQueryResult
}

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

function sortDirections(directions: string[]) {
  return [...new Set(directions.filter(Boolean))].sort((a, b) => {
    const aIndex = faceDirectionIndex.get(a as typeof FACE_DIRECTIONS[number])
    const bIndex = faceDirectionIndex.get(b as typeof FACE_DIRECTIONS[number])
    if (aIndex === undefined && bIndex === undefined) return a.localeCompare(b)
    if (aIndex === undefined) return 1
    if (bIndex === undefined) return -1
    return aIndex - bIndex
  })
}

function mapRouteRow(route: CragRouteIntelligenceRow): CanonicalCragRoute {
  return {
    id: route.id,
    name: (route.name || '').trim() || 'Unnamed route',
    grade: normalizeGrade(route.grade) || 'Unknown',
    slug: route.slug,
    routeType: route.route_type,
    directions: sortDirections(route.directions || []),
    hasTopo: Boolean(route.has_topo),
    topoImageCount: typeof route.topo_image_count === 'number' ? route.topo_image_count : 0,
    ratingAvg: typeof route.rating_avg === 'number' ? route.rating_avg : null,
    ratingCount: typeof route.rating_count === 'number' ? route.rating_count : 0,
    weightedRating: typeof route.weighted_rating === 'number' ? route.weighted_rating : null,
    sendCount: typeof route.send_count === 'number' ? route.send_count : 0,
    recentSendCount60d: typeof route.recent_send_count_60d === 'number' ? route.recent_send_count_60d : 0,
  }
}

export function dedupeCanonicalRoutes(routes: CanonicalCragRoute[], effectiveClimbIdByClimbId: Record<string, string>) {
  const groupedRoutes = new Map<string, CanonicalCragRoute>()

  for (const route of routes) {
    const effectiveClimbId = effectiveClimbIdByClimbId[route.id] || route.id
    const existing = groupedRoutes.get(effectiveClimbId)

    if (!existing) {
      groupedRoutes.set(effectiveClimbId, {
        ...route,
        id: effectiveClimbId,
      })
      continue
    }

    const isCanonicalRoute = route.id === effectiveClimbId
    groupedRoutes.set(effectiveClimbId, {
      ...existing,
      id: effectiveClimbId,
      name: isCanonicalRoute ? route.name : existing.name,
      grade: isCanonicalRoute ? route.grade : existing.grade,
      slug: isCanonicalRoute ? route.slug : (existing.slug || route.slug),
      routeType: existing.routeType || route.routeType,
      directions: sortDirections([...existing.directions, ...route.directions]),
      hasTopo: existing.hasTopo || route.hasTopo,
      topoImageCount: Math.max(existing.topoImageCount, route.topoImageCount),
      ratingAvg: existing.ratingAvg ?? route.ratingAvg,
      ratingCount: Math.max(existing.ratingCount, route.ratingCount),
      weightedRating: existing.weightedRating ?? route.weightedRating,
      sendCount: Math.max(existing.sendCount, route.sendCount),
      recentSendCount60d: Math.max(existing.recentSendCount60d, route.recentSendCount60d),
    })
  }

  return [...groupedRoutes.values()]
}

export function remapRoutePreviewsByEffectiveClimbId(
  routePreviewByClimbId: Record<string, CanonicalRoutePreview>,
  effectiveClimbIdByClimbId: Record<string, string>
) {
  const nextPreviewByClimbId: Record<string, CanonicalRoutePreview> = {}

  for (const [climbId, preview] of Object.entries(routePreviewByClimbId)) {
    const effectiveClimbId = effectiveClimbIdByClimbId[climbId] || climbId
    if (!nextPreviewByClimbId[effectiveClimbId]) {
      nextPreviewByClimbId[effectiveClimbId] = preview
    }
  }

  return nextPreviewByClimbId
}

export async function getCanonicalRouteFaces(
  supabase: SupabaseClientLike,
  cragId: string,
  climbId: string
) {
  const { data: routeData, error: routeDataError } = await supabase.rpc('get_crag_route_intelligence', { p_crag_id: cragId })
  if (routeDataError) {
    throw routeDataError
  }

  const baseRoutes = (routeData || []).map(mapRouteRow)
  const climbIds = baseRoutes.map((route) => route.id)
  let effectiveClimbIdByClimbId: Record<string, string> = {}

  if (climbIds.length > 0) {
    const { data, error } = await supabase
      .from('climbs')
      .select('id, shared_climb_id')
      .in('id', climbIds)
      .order('id', { ascending: true })

    if (error) {
      throw error
    }

    effectiveClimbIdByClimbId = Object.fromEntries(
      ((data || []) as ClimbIdentityRow[]).map((row) => [row.id, row.shared_climb_id || row.id])
    )
  }

  const effectiveClimbId = effectiveClimbIdByClimbId[climbId] || climbId
  const aliasClimbIds = Object.entries(effectiveClimbIdByClimbId)
    .filter(([, canonicalId]) => canonicalId === effectiveClimbId)
    .map(([id]) => id)

  if (!aliasClimbIds.includes(climbId)) {
    aliasClimbIds.push(climbId)
  }

  const { data: imageData, error: imageDataError } = await supabase
    .from('images')
    .select('id, url, latitude, longitude')
    .eq('crag_id', cragId)
    .order('created_at', { ascending: false })

  if (imageDataError) {
    throw imageDataError
  }

  const { data: cragImageLinkData, error: cragImageLinkError } = await supabase
    .from('crag_images')
    .select('linked_image_id, source_image_id')
    .eq('crag_id', cragId)
    .order('created_at', { ascending: false })

  if (cragImageLinkError) {
    throw cragImageLinkError
  }

  const linkedImageIds = Array.from(new Set(((cragImageLinkData || []) as CragImageLinkRow[])
    .flatMap((row) => [row.linked_image_id, row.source_image_id])
    .filter((value): value is string => typeof value === 'string' && value.length > 0)))

  const knownImageIds = new Set(((imageData || []) as CanonicalImageRow[]).map((image) => image.id))
  const missingLinkedImageIds = linkedImageIds.filter((imageId) => !knownImageIds.has(imageId))

  let missingLinkedImages: CanonicalImageRow[] = []
  if (missingLinkedImageIds.length > 0) {
    const { data, error } = await supabase
      .from('images')
      .select('id, url, latitude, longitude')
      .in('id', missingLinkedImageIds)
      .order('created_at', { ascending: false })

    if (error) {
      throw error
    }

    missingLinkedImages = (data || []) as CanonicalImageRow[]
  }

  const images = [...((imageData || []) as CanonicalImageRow[]), ...missingLinkedImages]
    .filter((image): image is CanonicalImageRow => typeof image?.id === 'string' && image.id.length > 0 && typeof image.url === 'string' && image.url.length > 0)
    .map((image) => ({
      ...image,
      url: resolveRouteImageUrl(`/images/${image.id}/v1/detail.jpg`),
    }))

  const imageById = new Map(images.map((image) => [image.id, image]))
  const imageIds = images.map((image) => image.id)
  const routePreviewByClimbId: Record<string, CanonicalRoutePreview> = {}

  if (imageIds.length > 0) {
    const { data: routeLineData, error: routeLineError } = await supabase
      .from('route_lines')
      .select('image_id, climb_id')
      .in('image_id', imageIds)
      .order('image_id', { ascending: true })
      .order('sequence_order', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true })

    if (routeLineError) {
      throw routeLineError
    }

    for (const row of (routeLineData || []) as RouteLineTargetRow[]) {
      if (typeof row?.climb_id !== 'string' || typeof row?.image_id !== 'string') continue
      if (!aliasClimbIds.includes(row.climb_id)) continue
      if (routePreviewByClimbId[row.climb_id]) continue
      const image = imageById.get(row.image_id)
      if (!image || !image.url) continue
      routePreviewByClimbId[row.climb_id] = {
        imageId: row.image_id,
        imageUrl: image.url,
      }
    }
  }

  const dedupedRoutePreviewByClimbId = remapRoutePreviewsByEffectiveClimbId(routePreviewByClimbId, effectiveClimbIdByClimbId)

  return {
    effectiveClimbId,
    aliasClimbIds,
    routePreviewByClimbId,
    dedupedRoutePreviewByClimbId,
    previewFaces: Object.values(dedupedRoutePreviewByClimbId),
  }
}
