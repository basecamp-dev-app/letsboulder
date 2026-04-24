import { getUnauthenticatedClient } from '@/lib/supabase-server'
import { SITE_URL } from '@/lib/site'
import {
  getSitemapPageRange,
  hasSitemapDataSource,
  renderUrlSet,
  sitemapXmlResponse,
  type SitemapEntry,
} from '@/lib/sitemap/xml'

export const revalidate = 3600

interface SitemapCragRow {
  slug: string | null
  country_code: string | null
  updated_at: string | null
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ page: string }> }
) {
  const { page } = await params
  const pageId = page.endsWith('.xml') ? page.slice(0, -4) : ''
  const range = getSitemapPageRange(pageId)

  if (!range || !hasSitemapDataSource()) {
    return new Response('Not Found', { status: 404 })
  }

  const { data, error } = await getUnauthenticatedClient()
    .from('crags')
    .select('slug, country_code, updated_at')
    .not('slug', 'is', null)
    .neq('slug', '')
    .not('country_code', 'is', null)
    .neq('country_code', '')
    .order('updated_at', { ascending: false })
    .order('slug', { ascending: true })
    .range(range.from, range.to)

  if (error) {
    return new Response('Sitemap unavailable', { status: 500 })
  }

  const entries: SitemapEntry[] = ((data || []) as SitemapCragRow[])
    .filter((crag) => crag.slug && crag.country_code)
    .map((crag) => ({
      url: `${SITE_URL}/${String(crag.country_code).toLowerCase()}/${crag.slug}`,
      lastModified: crag.updated_at ? new Date(crag.updated_at) : undefined,
    }))

  if (entries.length === 0) {
    return new Response('Not Found', { status: 404 })
  }

  return sitemapXmlResponse(renderUrlSet(entries))
}
