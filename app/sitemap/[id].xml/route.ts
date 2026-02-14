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
  return total > 0 ? Math.ceil(total / PAGE_SIZE) : 0
}

function pageRange(page: number) {
  const from = page * PAGE_SIZE
  const to = from + PAGE_SIZE - 1
  return { from, to }
}

function decodeSitemapId(id: number, counts: Counts): { kind: EntityKind; page: number } | null {
  if (!Number.isFinite(id) || id < 0) return null

  let cursor = id
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

function xmlEscape(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

function renderUrlset(entries: Array<{ loc: string; lastmod?: string; changefreq?: string; priority?: number }>) {
  const urls = entries
    .map((entry) => {
      const parts = [`<loc>${xmlEscape(entry.loc)}</loc>`]
      if (entry.lastmod) parts.push(`<lastmod>${entry.lastmod}</lastmod>`)
      if (entry.changefreq) parts.push(`<changefreq>${entry.changefreq}</changefreq>`)
      if (typeof entry.priority === 'number') parts.push(`<priority>${entry.priority.toFixed(1)}</priority>`)
      return `<url>${parts.join('')}</url>`
    })
    .join('')

  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`
}

export async function GET(request: Request, _context: { params: Promise<{}> }) {
  const match = request.url.match(/\/sitemap\/(\d+)\.xml(?:\?|$)/)
  const sitemapId = match ? Number.parseInt(match[1], 10) : Number.NaN

  const counts = await getCounts()
  const decoded = decodeSitemapId(sitemapId, counts)
  if (!decoded) {
    return new Response(renderUrlset([]), {
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
      },
    })
  }

  const supabase = await getSupabase()
  const { from, to } = pageRange(decoded.page)

  if (decoded.kind === 'crags') {
    const { data } = await supabase
      .from('crags')
      .select('id, updated_at, slug, country_code')
      .order('id', { ascending: true })
      .range(from, to)

    const entries = (data || []).map((crag) => {
      const loc = crag.slug && crag.country_code
        ? `${BASE_URL}/${crag.country_code.toLowerCase()}/${crag.slug}`
        : `${BASE_URL}/crag/${crag.id}`

      return {
        loc,
        lastmod: new Date(crag.updated_at || Date.now()).toISOString(),
        changefreq: 'weekly',
        priority: 0.7,
      }
    })

    return new Response(renderUrlset(entries), {
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
      },
    })
  }

  if (decoded.kind === 'climbs') {
    const { data } = await supabase
      .from('climbs')
      .select('id, updated_at, slug, crags:crag_id (slug, country_code)')
      .eq('status', 'active')
      .order('id', { ascending: true })
      .range(from, to)

    const entries = (data || []).map((climb) => {
      const cragJoin = (climb as unknown as { crags?: Array<{ slug: string | null; country_code: string | null }> | null }).crags
      const crag = Array.isArray(cragJoin) && cragJoin.length > 0 ? cragJoin[0] : null
      const routeSlug = (climb as { slug?: string | null }).slug
      const loc = routeSlug && crag?.slug && crag?.country_code
        ? `${BASE_URL}/${crag.country_code.toLowerCase()}/${crag.slug}/${routeSlug}`
        : `${BASE_URL}/climb/${climb.id}`

      return {
        loc,
        lastmod: new Date((climb as { updated_at?: string | null }).updated_at || Date.now()).toISOString(),
        changefreq: 'weekly',
        priority: 0.6,
      }
    })

    return new Response(renderUrlset(entries), {
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
      },
    })
  }

  const { data } = await supabase
    .from('images')
    .select('id, updated_at')
    .eq('is_verified', true)
    .order('id', { ascending: true })
    .range(from, to)

  const entries = (data || []).map((image) => ({
    loc: `${BASE_URL}/image/${image.id}`,
    lastmod: new Date(image.updated_at || Date.now()).toISOString(),
    changefreq: 'monthly',
    priority: 0.5,
  }))

  return new Response(renderUrlset(entries), {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
    },
  })
}
