import { normalizeRouteType } from '@/features/crags/server/crag-api'

type RequestSupabaseClient = ReturnType<typeof import('@/lib/supabase-server').getServerClientFromRequest>

interface AdminCragRow {
  id: string
  name: string
  latitude: number | null
  longitude: number | null
  rock_type: string | null
  type: string | null
  region_name: string | null
  sub_area: string | null
  created_at: string | null
}

interface AdminCragWithCounts {
  id: string
  name: string
  latitude: number | null
  longitude: number | null
  rock_type: string | null
  type: string | null
  region_tag: string | null
  sub_area: string | null
  has_primary_region_tag: boolean
  climb_count: number
  image_count: number
  route_type_counts: Array<{ type: string; count: number }>
  created_at: string | null
}

export async function loadAdminCragsWithCounts(supabase: RequestSupabaseClient): Promise<{ crags: AdminCragWithCounts[]; error: string | null }> {
  try {
    const { data: crags, error: cragsError } = await supabase
      .from('crags')
      .select('id, name, latitude, longitude, rock_type, type, region_name, sub_area, created_at')
      .is('deleted_at', null)

    if (cragsError) return { crags: [], error: `Error fetching crags: ${cragsError.message}` }

    const cragIds = crags?.map((c) => c.id) || []
    if (cragIds.length === 0) return { crags: [], error: null }

    const [{ data: primaryTagRows, error: primaryTagError }, { data: climbData, error: climbError }, { data: imageData, error: imageError }] = await Promise.all([
      supabase
        .from('crag_location_tags')
        .select('crag_id, location_tags!inner(id,name)')
        .eq('is_primary_region', true)
        .in('crag_id', cragIds),
      supabase
        .from('climbs')
        .select('crag_id, id, route_type, status, deleted_at')
        .in('crag_id', cragIds),
      supabase
        .from('images')
        .select('crag_id, id')
        .in('crag_id', cragIds),
    ])

    if (primaryTagError) return { crags: [], error: `Error fetching crag tags: ${primaryTagError.message}` }
    if (climbError) return { crags: [], error: `Error fetching climb counts: ${climbError.message}` }
    if (imageError) return { crags: [], error: `Error fetching image counts: ${imageError.message}` }

    const primaryTagMap = new Map<string, string>()
    const cragIdsWithPrimaryTag = new Set<string>()
    for (const row of (primaryTagRows || [])) {
      const locationTag = Array.isArray(row.location_tags) ? row.location_tags[0] : row.location_tags
      if (!locationTag?.name) continue
      primaryTagMap.set(row.crag_id, locationTag.name)
      cragIdsWithPrimaryTag.add(row.crag_id)
    }

    const climbCountMap = new Map<string, number>()
    const routeTypeCountMap = new Map<string, Map<string, number>>()
    for (const climb of (climbData || [])) {
      if (!climb.crag_id || climb.deleted_at) continue
      if (climb.status && climb.status !== 'approved') continue

      climbCountMap.set(climb.crag_id, (climbCountMap.get(climb.crag_id) || 0) + 1)

      const normalizedType = normalizeRouteType(climb.route_type)
      if (!normalizedType) continue

      const perCrag = routeTypeCountMap.get(climb.crag_id) || new Map<string, number>()
      perCrag.set(normalizedType, (perCrag.get(normalizedType) || 0) + 1)
      routeTypeCountMap.set(climb.crag_id, perCrag)
    }

    const imageCountMap = new Map<string, number>()
    for (const image of (imageData || [])) {
      if (!image.crag_id) continue
      imageCountMap.set(image.crag_id, (imageCountMap.get(image.crag_id) || 0) + 1)
    }

    const cragsWithCounts: AdminCragWithCounts[] = (crags || []).map((crag: AdminCragRow) => ({
      id: crag.id,
      name: crag.name,
      latitude: crag.latitude,
      longitude: crag.longitude,
      rock_type: crag.rock_type,
      type: crag.type,
      region_tag: primaryTagMap.get(crag.id) || crag.region_name || null,
      sub_area: crag.sub_area || null,
      has_primary_region_tag: cragIdsWithPrimaryTag.has(crag.id),
      climb_count: climbCountMap.get(crag.id) || 0,
      image_count: imageCountMap.get(crag.id) || 0,
      route_type_counts: Array.from(routeTypeCountMap.get(crag.id)?.entries() || [])
        .map(([type, count]) => ({ type, count }))
        .sort((a, b) => (b.count !== a.count ? b.count - a.count : a.type.localeCompare(b.type))),
      created_at: crag.created_at,
    }))

    return { crags: cragsWithCounts, error: null }
  } catch (error) {
    return { crags: [], error: error instanceof Error ? error.message : 'Unknown error fetching crags' }
  }
}
