export function slugify(input: string): string {
  const s = (input || '').trim().toLowerCase()
  const replaced = s
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '')
  return replaced
}

export function makeUniqueSlug(base: string, used: Set<string>): string {
  const normalizedBase = slugify(base) || 'route'
  if (!used.has(normalizedBase)) {
    used.add(normalizedBase)
    return normalizedBase
  }

  for (let i = 2; i <= 1000; i++) {
    const candidate = `${normalizedBase}-${i}`
    if (!used.has(candidate)) {
      used.add(candidate)
      return candidate
    }
  }

  const fallback = `${normalizedBase}-${Date.now()}`
  used.add(fallback)
  return fallback
}

type SupabaseClient = ReturnType<typeof import('@/lib/supabase-server').getServerClientFromRequest>

export function fetchUsedSlugs(supabase: SupabaseClient, table: 'crags', scope: { country_code: string }): Promise<Set<string>>
export function fetchUsedSlugs(supabase: SupabaseClient, table: 'climbs', scope: { crag_id: string }): Promise<Set<string>>
export function fetchUsedSlugs(supabase: SupabaseClient, table: 'places', scope: { country_code: string; type: string }): Promise<Set<string>>
export async function fetchUsedSlugs(
  supabase: SupabaseClient,
  table: 'crags' | 'climbs' | 'places',
  scope: { country_code?: string; crag_id?: string; type?: string },
): Promise<Set<string>> {
  let existingSlugs: Array<{ slug: string | null }> | null = null
  if (table === 'crags') {
    const result = await supabase.from('crags').select('slug').eq('country_code', scope.country_code || '').not('slug', 'is', null).limit(10000)
    existingSlugs = result.data
  } else if (table === 'climbs') {
    const result = await supabase.from('climbs').select('slug').eq('crag_id', scope.crag_id || '').not('slug', 'is', null).limit(10000)
    existingSlugs = result.data
  } else {
    const result = await supabase.from('places').select('slug').eq('country_code', scope.country_code || '').eq('type', scope.type || '').not('slug', 'is', null).limit(10000)
    existingSlugs = result.data
  }

  const used = new Set<string>()
  for (const row of (existingSlugs || [])) {
    if (row?.slug) used.add(row.slug)
  }
  return used
}
