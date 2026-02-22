import { createServerClient } from '@supabase/ssr'
import { SITE_URL } from '@/lib/site'

const BASE_URL = SITE_URL
const PAGE_SIZE = 5000

interface Counts {
  crags: number
}

function pageCount(total: number) {
  return total > 0 ? Math.ceil(total / PAGE_SIZE) : 0
}

function pageRange(page: number) {
  const from = page * PAGE_SIZE
  const to = from + PAGE_SIZE - 1
  return { from, to }
}

function decodeSitemapId(id: number, counts: Counts): { page: number } | null {
  if (!Number.isFinite(id) || id < 0) return null

  const cragPages = pageCount(counts.crags)
  if (id < cragPages) return { page: id }

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
  const cragsCountResult = await supabase
    .from('crags')
    .select('id', { count: 'exact', head: true })
    .not('slug', 'is', null)
    .neq('slug', '')
    .not('country_code', 'is', null)
    .neq('country_code', '')

  return {
    crags: cragsCountResult.count || 0,
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

export async function GET(request: Request) {
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

  const { data } = await supabase
    .from('crags')
    .select('updated_at, slug, country_code')
    .not('slug', 'is', null)
    .neq('slug', '')
    .not('country_code', 'is', null)
    .neq('country_code', '')
    .order('id', { ascending: true })
    .range(from, to)

  const entries = (data || []).map((crag) => ({
    loc: `${BASE_URL}/${String(crag.country_code).toLowerCase()}/${crag.slug}`,
    lastmod: new Date(crag.updated_at || Date.now()).toISOString(),
    changefreq: 'weekly',
    priority: 0.7,
  }))

  return new Response(renderUrlset(entries), {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
    },
  })
}
