import { createServerClient } from '@supabase/ssr'
import { SITE_URL } from '@/lib/site'

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

export async function GET() {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return [] }, setAll() {} } }
  )

  const { data } = await supabase
    .from('crags')
    .select('slug, updated_at, country_code')
    .not('slug', 'is', null)
    .neq('slug', '')
    .not('country_code', 'is', null)
    .neq('country_code', '')
    .order('id', { ascending: true })

  const entries = (data || []).map((crag) => ({
    loc: `${SITE_URL}/${String(crag.country_code).toLowerCase()}/${crag.slug}`,
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
