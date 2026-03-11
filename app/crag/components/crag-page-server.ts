import { normalizeGrade } from '@/lib/grades'
import type { Database } from '@/types/database'
import type { CragRoute, RoutePreview } from '@/app/crag/components/CragPageClient'

type SupabaseClientLike = {
  rpc: (fn: 'get_crag_route_intelligence', args: { p_crag_id: string }) => Promise<{ data: Database['public']['Functions']['get_crag_route_intelligence']['Returns'] | null; error: unknown }>
  from: (table: 'images' | 'route_lines' | 'crag_images') => {
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

type CragRouteIntelligenceRow = Database['public']['Functions']['get_crag_route_intelligence']['Returns'][number]

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

const FACE_DIRECTIONS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const
const faceDirectionIndex = new Map(FACE_DIRECTIONS.map((direction, index) => [direction, index]))

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

function mapRouteRow(route: CragRouteIntelligenceRow): CragRoute {
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

function getAverageCoordinates(images: ImageRow[]): [number, number] | null {
  if (images.length === 0) return null
  const sum = images.reduce(
    (acc, image) => {
      acc.lat += image.latitude || 0
      acc.lng += image.longitude || 0
      return acc
    },
    { lat: 0, lng: 0 }
  )
  return [sum.lat / images.length, sum.lng / images.length]
}

function resolveRouteImageUrl(url: string) {
  if (!url.startsWith('private://')) return url
  const [, bucketAndPath = ''] = url.split('private://')
  const slashIndex = bucketAndPath.indexOf('/')
  if (slashIndex === -1) return url
  const bucket = bucketAndPath.slice(0, slashIndex)
  const path = bucketAndPath.slice(slashIndex + 1)
  return `/api/media/${bucket}/${path}`
}

export async function loadInitialCragRouteData(supabase: SupabaseClientLike, cragId: string, cragCoords?: { latitude: number | null; longitude: number | null }) {
  const { data: routeData } = await supabase.rpc('get_crag_route_intelligence', { p_crag_id: cragId })
  const initialRoutes = (routeData || []).map(mapRouteRow)

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

  const imageById = new Map(images.map((image) => [image.id, image]))
  const imageIds = images.map((image) => image.id)
  const initialRoutePreviewByClimbId: Record<string, RoutePreview> = {}

  if (imageIds.length > 0) {
    const { data: routeLineData } = await supabase
      .from('route_lines')
      .select('image_id, climb_id')
      .in('image_id', imageIds)
      .order('image_id', { ascending: true })
      .order('sequence_order', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true })

    for (const row of (routeLineData || []) as RouteLineTargetRow[]) {
      if (initialRoutePreviewByClimbId[row.climb_id]) continue
      const image = imageById.get(row.image_id)
      if (!image) continue
      initialRoutePreviewByClimbId[row.climb_id] = {
        imageId: row.image_id,
        imageUrl: image.url,
      }
    }
  }

  const withCoords = images.filter((image) => typeof image.latitude === 'number' && typeof image.longitude === 'number')
  const initialCragCenter = typeof cragCoords?.latitude === 'number' && typeof cragCoords?.longitude === 'number'
    ? [cragCoords.latitude, cragCoords.longitude] as [number, number]
    : getAverageCoordinates(withCoords)

  return {
    initialRoutes,
    initialRoutePreviewByClimbId,
    initialCragCenter,
  }
}
