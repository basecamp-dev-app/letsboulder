import { getDisplayName, getClimbRecord, type ProfileRow } from '@/lib/profile-helpers'

type SupabaseClientFromRequest = ReturnType<typeof import('@/lib/supabase-server').getServerClientFromRequest>

export interface PlaceClimbRow {
  user_id: string
  climb_id: string
  style: string
  created_at: string | null
  star_rating?: number | null
  climbs: {
    id: string
    grade: string
    name?: string
    slug?: string | null
    place_id: string | null
    crag_id: string | null
    crags:
      | {
          slug: string | null
          country_code: string | null
        }
      | Array<{
          slug: string | null
          country_code: string | null
        }>
      | null
  } | null
}

export interface EnrichedPlaceClimbRow {
  user_id: string
  climb_id: string
  style: string
  created_at: string
  star_rating?: number | null
  profile: {
    id: string
    display_name: string
    avatar_url: string | null
  }
  climb: {
    id: string
    name: string
    grade: string
    page_url: string
  }
}

function getCanonicalClimbPath(climb: PlaceClimbRow['climbs']): string {
  if (!climb) return '/'
  if (!climb.slug) return `/climb/${climb.id}`

  const crag = Array.isArray(climb.crags) ? climb.crags[0] || null : climb.crags
  if (!crag?.slug || !crag.country_code) {
    return `/climb/${climb.id}`
  }

  return `/${crag.country_code.toLowerCase()}/${crag.slug}/${climb.slug}`
}

export async function loadPlaceUserClimbs(
  supabase: SupabaseClientFromRequest,
  placeId: string,
  options?: { windowStart?: string | null; styles?: string[] },
): Promise<PlaceClimbRow[]> {
  const styles = options?.styles || ['top', 'flash', 'onsight']
  const windowStart = options?.windowStart

  let byPlaceQuery = supabase
    .from('user_climbs')
    .select('user_id, climb_id, style, created_at, climbs!inner(id, grade, name, slug, place_id, crag_id, crags:crag_id(slug, country_code))')
    .in('style', styles)
    .eq('climbs.place_id', placeId)

  let byLegacyCragQuery = supabase
    .from('user_climbs')
    .select('user_id, climb_id, style, created_at, climbs!inner(id, grade, name, slug, place_id, crag_id, crags:crag_id(slug, country_code))')
    .in('style', styles)
    .eq('climbs.crag_id', placeId)
    .is('climbs.place_id', null)

  if (windowStart) {
    byPlaceQuery = byPlaceQuery.gte('created_at', windowStart)
    byLegacyCragQuery = byLegacyCragQuery.gte('created_at', windowStart)
  }

  const [byPlaceResult, byLegacyCragResult] = await Promise.all([byPlaceQuery, byLegacyCragQuery])

  if (byPlaceResult.error) throw byPlaceResult.error
  if (byLegacyCragResult.error) throw byLegacyCragResult.error

  const combinedRows = [...(byPlaceResult.data || []), ...(byLegacyCragResult.data || [])] as unknown as PlaceClimbRow[]

  const deduped = new Map<string, PlaceClimbRow>()
  for (const row of combinedRows) {
    if (!row.created_at) continue
    deduped.set(`${row.user_id}:${row.climb_id}:${row.created_at}:${row.style}`, row)
  }

  return Array.from(deduped.values())
    .sort((a, b) => new Date(b.created_at!).getTime() - new Date(a.created_at!).getTime())
}

export async function enrichPlaceClimbsWithProfiles(
  supabase: SupabaseClientFromRequest,
  rows: PlaceClimbRow[],
): Promise<EnrichedPlaceClimbRow[]> {
  const userIds = Array.from(new Set(rows.map((row) => row.user_id)))
  if (userIds.length === 0) return []

  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('id, username, display_name, avatar_url, is_public')
    .eq('is_public', true)
    .in('id', userIds)

  if (profilesError) throw profilesError

  const profileMap = new Map(((profiles || []) as ProfileRow[]).map((profile) => [profile.id, profile]))

  const result: EnrichedPlaceClimbRow[] = []
  for (const row of rows) {
    if (!row.created_at) continue
    const profile = profileMap.get(row.user_id)
    if (!profile) continue

    const climb = getClimbRecord(row.climbs)
    if (!climb) continue

    result.push({
      user_id: row.user_id,
      climb_id: row.climb_id,
      style: row.style,
      created_at: row.created_at,
      star_rating: row.star_rating,
      profile: {
        id: profile.id,
        display_name: getDisplayName(profile),
        avatar_url: profile.avatar_url,
      },
      climb: {
        id: climb.id,
        name: climb.name || '',
        grade: climb.grade,
        page_url: getCanonicalClimbPath(row.climbs),
      },
    })
  }

  return result
}
