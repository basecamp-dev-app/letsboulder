import { SITE_URL } from '@/lib/site'

const BASE_URL = SITE_URL

function xmlEscape(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

export async function GET() {
  const routes = [
    { loc: BASE_URL, changefreq: 'monthly', priority: '1.0' },
    { loc: `${BASE_URL}/bouldering-map`, changefreq: 'monthly', priority: '0.9' },
    { loc: `${BASE_URL}/climbing-map`, changefreq: 'monthly', priority: '0.8' },
    { loc: `${BASE_URL}/rock-climbing-map`, changefreq: 'monthly', priority: '0.8' },
    { loc: `${BASE_URL}/guernsey-bouldering`, changefreq: 'weekly', priority: '0.9' },
    { loc: `${BASE_URL}/about`, changefreq: 'yearly', priority: '0.6' },
    { loc: `${BASE_URL}/rankings`, changefreq: 'weekly', priority: '0.8' },
    { loc: `${BASE_URL}/privacy`, changefreq: 'yearly', priority: '0.4' },
    { loc: `${BASE_URL}/terms`, changefreq: 'yearly', priority: '0.4' },
    { loc: `${BASE_URL}/logbook`, changefreq: 'weekly', priority: '0.6' },
    { loc: `${BASE_URL}/submit`, changefreq: 'monthly', priority: '0.7' },
  ]

  const urls = routes
    .map(
      (route) => `<url><loc>${xmlEscape(route.loc)}</loc><changefreq>${route.changefreq}</changefreq><priority>${route.priority}</priority></url>`
    )
    .join('')

  const body = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`

  return new Response(body, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
    },
  })
}
