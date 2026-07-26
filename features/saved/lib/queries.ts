import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { resolveEffectiveClimbId } from '@/features/climb/lib/effective-climb'
import type { SavedClimb, SavedCrag } from '@/features/saved/lib/types'

type TypedSupabase = SupabaseClient<Database>
type SavedClimbRow = Database['public']['Tables']['saved_climbs']['Row']
type SavedCragRow = Database['public']['Tables']['saved_crags']['Row']
type ClimbRow = Pick<Database['public']['Tables']['climbs']['Row'], 'id' | 'name' | 'grade' | 'slug' | 'crag_id'>
type CragRow = Pick<Database['public']['Tables']['crags']['Row'], 'id' | 'name' | 'slug' | 'country_code' | 'region_name' | 'country'>

export async function isClimbSavedByUser(
  supabase: TypedSupabase,
  userId: string,
  climbId: string,
): Promise<boolean> {
  const effectiveClimbId = await resolveEffectiveClimbId(supabase, climbId)
  if (!effectiveClimbId) return false

  const { data, error } = await supabase
    .from('saved_climbs')
    .select('climb_id')
    .eq('user_id', userId)
    .eq('climb_id', effectiveClimbId)
    .maybeSingle()

  return !error && !!data
}

export async function isCragSavedByUser(
  supabase: TypedSupabase,
  userId: string,
  cragId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('saved_crags')
    .select('crag_id')
    .eq('user_id', userId)
    .eq('crag_id', cragId)
    .maybeSingle()

  return !error && !!data
}

export async function fetchSavedClimbs(
  supabase: TypedSupabase,
  userId: string,
): Promise<SavedClimb[]> {
  const { data, error } = await supabase
    .from('saved_climbs')
    .select('user_id, climb_id, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (error) throw error
  if (!data) return []

  const savedRows = data as SavedClimbRow[]
  const climbIds = Array.from(new Set(savedRows.map((row) => row.climb_id)))
  if (climbIds.length === 0) return []

  const { data: climbsData, error: climbsError } = await supabase
    .from('climbs')
    .select('id, name, grade, slug, crag_id')
    .in('id', climbIds)

  if (climbsError) throw climbsError
  if (!climbsData) return []

  const climbs = climbsData as ClimbRow[]
  const cragIds = Array.from(new Set(climbs.map((climb) => climb.crag_id).filter((value): value is string => typeof value === 'string')))
  const cragMap = new Map<string, Pick<CragRow, 'id' | 'name' | 'slug' | 'country_code'>>()

  if (cragIds.length > 0) {
    const { data: cragsData, error: cragsError } = await supabase
      .from('crags')
      .select('id, name, slug, country_code, region_name, country')
      .in('id', cragIds)

    if (cragsError) throw cragsError
    for (const crag of (cragsData || []) as CragRow[]) {
      cragMap.set(crag.id, crag)
    }
  }

  const climbMap = new Map(climbs.map((climb) => [climb.id, climb]))

  return savedRows.flatMap((row) => {
    const climb = climbMap.get(row.climb_id)
    if (!climb) return []

    const crag = climb.crag_id ? cragMap.get(climb.crag_id) : undefined

    return [{
      climbId: climb.id,
      createdAt: row.created_at,
      name: climb.name || 'Unnamed climb',
      grade: climb.grade,
      cragName: crag?.name || 'Unknown crag',
      canonicalUrl: climb.slug && crag?.slug && crag.country_code
        ? `/${crag.country_code.toLowerCase()}/${crag.slug}/${climb.slug}`
        : null,
    }]
  })
}

export async function fetchSavedCrags(
  supabase: TypedSupabase,
  userId: string,
): Promise<SavedCrag[]> {
  const { data, error } = await supabase
    .from('saved_crags')
    .select('user_id, crag_id, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (error) throw error
  if (!data) return []

  const savedRows = data as SavedCragRow[]
  const cragIds = Array.from(new Set(savedRows.map((row) => row.crag_id)))
  if (cragIds.length === 0) return []

  const { data: cragsData, error: cragsError } = await supabase
    .from('crags')
    .select('id, name, slug, country_code, region_name, country')
    .in('id', cragIds)

  if (cragsError) throw cragsError
  if (!cragsData) return []

  const cragMap = new Map((cragsData as CragRow[]).map((crag) => [crag.id, crag]))

  return savedRows.flatMap((row) => {
    const crag = cragMap.get(row.crag_id)
    if (!crag) return []

    return [{
      cragId: crag.id,
      createdAt: row.created_at,
      name: crag.name,
      regionName: crag.region_name,
      countryName: crag.country,
      canonicalUrl: crag.slug && crag.country_code
        ? `/${crag.country_code.toLowerCase()}/${crag.slug}`
        : null,
    }]
  })
}
