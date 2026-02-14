import { MetadataRoute } from 'next'
import { createServerClient } from '@supabase/ssr'
import { SITE_URL } from '@/lib/site'

const BASE_URL = SITE_URL
const PAGE_SIZE = 5000

type EntityKind = 'crags' | 'climbs' | 'images'

interface Counts {
  crags: number
  climbs: number
  images: number
}

function pageCount(total: number) {
  return Math.max(1, Math.ceil(total / PAGE_SIZE))
}

async function getSupabase() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return [] }, setAll() {} } }
  )
}

async function getCounts(): Promise<Counts> {
  const supabase = await getSupabase()
  const [cragsCountResult, climbsCountResult, imagesCountResult] = await Promise.all([
    supabase.from('crags').select('id', { count: 'exact', head: true }),
    supabase.from('climbs').select('id', { count: 'exact', head: true }).eq('status', 'active'),
    supabase.from('images').select('id', { count: 'exact', head: true }).eq('is_verified', true),
  ])

  return {
    crags: cragsCountResult.count || 0,
    climbs: climbsCountResult.count || 0,
    images: imagesCountResult.count || 0,
  }
}

function decodeSitemapId(id: number, counts: Counts): { kind: 'static' | EntityKind; page: number } | null {
  if (id === 0) return { kind: 'static', page: 0 }

  let cursor = id - 1
  const cragPages = pageCount(counts.crags)
  if (cursor < cragPages) return { kind: 'crags', page: cursor }
  cursor -= cragPages

  const climbPages = pageCount(counts.climbs)
  if (cursor < climbPages) return { kind: 'climbs', page: cursor }
  cursor -= climbPages

  const imagePages = pageCount(counts.images)
  if (cursor < imagePages) return { kind: 'images', page: cursor }

  return null
}

function pageRange(page: number) {
  const from = page * PAGE_SIZE
  const to = from + PAGE_SIZE - 1
  return { from, to }
}

function staticRoutes(): MetadataRoute.Sitemap {
  return [
    { url: BASE_URL, changeFrequency: 'monthly', priority: 1 },
    { url: `${BASE_URL}/bouldering-map`, changeFrequency: 'monthly', priority: 0.9 },
    { url: `${BASE_URL}/climbing-map`, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${BASE_URL}/rock-climbing-map`, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${BASE_URL}/guernsey-bouldering`, changeFrequency: 'weekly', priority: 0.9 },
    { url: `${BASE_URL}/about`, changeFrequency: 'yearly', priority: 0.6 },
    { url: `${BASE_URL}/rankings`, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${BASE_URL}/privacy`, changeFrequency: 'yearly', priority: 0.4 },
    { url: `${BASE_URL}/terms`, changeFrequency: 'yearly', priority: 0.4 },
    { url: `${BASE_URL}/logbook`, changeFrequency: 'weekly', priority: 0.6 },
    { url: `${BASE_URL}/submit`, changeFrequency: 'monthly', priority: 0.7 },
  ]
}

export async function generateSitemaps() {
  const counts = await getCounts()
  const totalPages = 1 + pageCount(counts.crags) + pageCount(counts.climbs) + pageCount(counts.images)

  return Array.from({ length: totalPages }, (_, index) => ({ id: index }))
}

export default async function sitemap({ id }: { id: Promise<number> }): Promise<MetadataRoute.Sitemap> {
  const sitemapId = await id
  const counts = await getCounts()
  const decoded = decodeSitemapId(sitemapId, counts)
  if (!decoded) return []

  if (decoded.kind === 'static') {
    return staticRoutes()
  }

  const supabase = await getSupabase()
  const { from, to } = pageRange(decoded.page)

  if (decoded.kind === 'crags') {
    const { data } = await supabase
      .from('crags')
      .select('id, updated_at, slug, country_code')
      .order('id', { ascending: true })
      .range(from, to)

    return (data || []).map((crag) => {
      const url = crag.slug && crag.country_code
        ? `${BASE_URL}/${crag.country_code.toLowerCase()}/${crag.slug}`
        : `${BASE_URL}/crag/${crag.id}`

      return {
        url,
        lastModified: new Date(crag.updated_at || Date.now()),
        changeFrequency: 'weekly' as const,
        priority: 0.7,
      }
    })
  }

  if (decoded.kind === 'climbs') {
    const { data } = await supabase
      .from('climbs')
      .select('id, updated_at, slug, crags:crag_id (slug, country_code)')
      .eq('status', 'active')
      .order('id', { ascending: true })
      .range(from, to)

    return (data || []).map((climb) => {
      const cragJoin = (climb as unknown as { crags?: Array<{ slug: string | null; country_code: string | null }> | null }).crags
      const crag = Array.isArray(cragJoin) && cragJoin.length > 0 ? cragJoin[0] : null
      const routeSlug = (climb as { slug?: string | null }).slug
      const url = routeSlug && crag?.slug && crag?.country_code
        ? `${BASE_URL}/${crag.country_code.toLowerCase()}/${crag.slug}/${routeSlug}`
        : `${BASE_URL}/climb/${climb.id}`

      return {
        url,
        lastModified: new Date((climb as { updated_at?: string | null }).updated_at || Date.now()),
        changeFrequency: 'weekly' as const,
        priority: 0.6,
      }
    })
  }

  const { data } = await supabase
    .from('images')
    .select('id, updated_at')
    .eq('is_verified', true)
    .order('id', { ascending: true })
    .range(from, to)

  return (data || []).map((image) => ({
    url: `${BASE_URL}/image/${image.id}`,
    lastModified: new Date(image.updated_at || Date.now()),
    changeFrequency: 'monthly' as const,
    priority: 0.5,
  }))
}
