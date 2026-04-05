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

export async function fetchUsedSlugs(
  supabase: SupabaseClient,
  table: string,
  scope: Record<string, string | null>,
): Promise<Set<string>> {
  let query = supabase.from(table).select('slug')
  for (const [col, val] of Object.entries(scope)) {
    query = query.eq(col, val)
  }
  const { data: existingSlugs } = await query.not('slug', 'is', null).limit(10000)
  const used = new Set<string>()
  for (const row of (existingSlugs || [])) {
    if (row?.slug) used.add(row.slug)
  }
  return used
}
