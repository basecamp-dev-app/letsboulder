import { createServerClient } from '@supabase/ssr'
import { SITE_URL } from '@/lib/site'

const PAGE_SIZE = 5000

function pageCount(total: number) {
  return total > 0 ? Math.ceil(total / PAGE_SIZE) : 0
}

async function getCounts() {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return [] }, setAll() {} } }
  )

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

export async function GET() {
  const counts = await getCounts()
  const dynamicPageCount = pageCount(counts.crags) + pageCount(counts.climbs) + pageCount(counts.images)

  const sitemapUrls: string[] = [`${SITE_URL}/static-sitemap.xml`]

  for (let i = 0; i < dynamicPageCount; i += 1) {
    sitemapUrls.push(`${SITE_URL}/sitemap/${i}.xml`)
  }

  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemapUrls
    .map((url) => `  <sitemap><loc>${xmlEscape(url)}</loc></sitemap>`)
    .join('\n')}\n</sitemapindex>`

  return new Response(body, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
    },
  })
}
