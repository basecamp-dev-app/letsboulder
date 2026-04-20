import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { resolveEffectiveClimbId } from '@/features/climb/lib/effective-climb'
import type { SavedClimb, SavedCrag } from '@/features/saved/lib/types'

type TypedSupabase = SupabaseClient<Database>

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
    .select('created_at, climbs!inner(id, name, grade, slug, crag_id, crags(id, name, slug, country_code))')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (error || !data) return []

  return data.flatMap((row) => {
    const climb = Array.isArray(row.climbs) ? row.climbs[0] : row.climbs
    const crag = Array.isArray(climb?.crags) ? climb.crags[0] : climb?.crags
    if (!climb) return []

    return [{
      climbId: climb.id,
      createdAt: row.created_at,
      name: climb.name,
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
    .select('created_at, crags!inner(id, name, slug, country_code, region_name, country)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (error || !data) return []

  return data.flatMap((row) => {
    const crag = Array.isArray(row.crags) ? row.crags[0] : row.crags
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
