import { env } from '@/lib/env'
import { SITE_URL } from '@/lib/site'

export const SITEMAP_PAGE_SIZE = 45_000

export interface SitemapEntry {
  url: string
  lastModified?: Date
}

export function hasSitemapDataSource() {
  return Boolean(env.NEXT_PUBLIC_SUPABASE_URL && env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
}

export function getStaticSitemapEntries(now = new Date()): SitemapEntry[] {
  return [
    { url: SITE_URL, lastModified: now },
    { url: `${SITE_URL}/about`, lastModified: now },
    { url: `${SITE_URL}/cookies`, lastModified: now },
    { url: `${SITE_URL}/gym-owners`, lastModified: now },
    { url: `${SITE_URL}/privacy`, lastModified: now },
    { url: `${SITE_URL}/terms`, lastModified: now },
  ]
}

export function getSitemapPageCount(count: number | null) {
  if (!count || count <= 0) return 0
  return Math.ceil(count / SITEMAP_PAGE_SIZE)
}

export function getSitemapPageRange(pageParam: string) {
  const page = Number(pageParam)

  if (!Number.isInteger(page) || page < 0) return null

  const from = page * SITEMAP_PAGE_SIZE
  return { page, from, to: from + SITEMAP_PAGE_SIZE - 1 }
}

export function sitemapXmlResponse(xml: string, init?: ResponseInit) {
  const headers = new Headers(init?.headers)
  headers.set('Content-Type', 'application/xml; charset=utf-8')
  headers.set('Cache-Control', 'public, max-age=0, s-maxage=3600')

  return new Response(xml, { ...init, headers })
}

export function renderSitemapIndex(entries: SitemapEntry[]) {
  return xmlDocument(`
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries.map((entry) => `  <sitemap>${renderLocAndLastmod(entry)}</sitemap>`).join('\n')}
</sitemapindex>`)
}

export function renderUrlSet(entries: SitemapEntry[]) {
  return xmlDocument(`
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries.map((entry) => `  <url>${renderLocAndLastmod(entry)}</url>`).join('\n')}
</urlset>`)
}

function renderLocAndLastmod(entry: SitemapEntry) {
  const lastmod = entry.lastModified ? `<lastmod>${xmlEscape(entry.lastModified.toISOString())}</lastmod>` : ''
  return `<loc>${xmlEscape(entry.url)}</loc>${lastmod}`
}

function xmlDocument(body: string) {
  return `<?xml version="1.0" encoding="UTF-8"?>${body}\n`
}

function xmlEscape(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}
