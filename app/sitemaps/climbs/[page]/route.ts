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

interface SitemapClimbRow {
  slug: string | null
  updated_at: string | null
  crags:
    | {
        slug: string | null
        country_code: string | null
      }
    | Array<{
        slug: string | null
        country_code: string | null
      }>
    | null
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
    .from('climbs')
    .select('slug, updated_at, crags!inner(slug, country_code)')
    .not('slug', 'is', null)
    .neq('slug', '')
    .in('status', ['active', 'approved'])
    .not('crags.slug', 'is', null)
    .neq('crags.slug', '')
    .not('crags.country_code', 'is', null)
    .neq('crags.country_code', '')
    .order('updated_at', { ascending: false })
    .order('slug', { ascending: true })
    .range(range.from, range.to)

  if (error) {
    return new Response('Sitemap unavailable', { status: 500 })
  }

  const entries: SitemapEntry[] = ((data || []) as SitemapClimbRow[])
    .map((climb): SitemapEntry | null => {
      const crag = Array.isArray(climb.crags) ? climb.crags[0] : climb.crags
      if (!climb.slug || !crag?.slug || !crag.country_code) return null

      return {
        url: `${SITE_URL}/${String(crag.country_code).toLowerCase()}/${crag.slug}/${climb.slug}`,
        lastModified: climb.updated_at ? new Date(climb.updated_at) : undefined,
      }
    })
    .filter((entry): entry is SitemapEntry => entry !== null)

  if (entries.length === 0) {
    return new Response('Not Found', { status: 404 })
  }

  return sitemapXmlResponse(renderUrlSet(entries))
}
