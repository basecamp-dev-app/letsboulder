import { getUnauthenticatedClient } from '@/lib/supabase-server'
import { SITE_URL } from '@/lib/site'
import {
  getSitemapPageCount,
  hasSitemapDataSource,
  renderSitemapIndex,
  sitemapXmlResponse,
} from '@/lib/sitemap/xml'

export const revalidate = 3600

export async function GET() {
  const now = new Date()
  const entries = [{ url: `${SITE_URL}/sitemaps/static.xml`, lastModified: now }]

  if (hasSitemapDataSource()) {
    const supabase = getUnauthenticatedClient()
    const [cragResult, climbResult] = await Promise.all([
      supabase
        .from('crags')
        .select('id', { count: 'exact', head: true })
        .eq('publication_status', 'published')
        .is('deleted_at', null)
        .is('superseded_by', null)
        .not('slug', 'is', null)
        .neq('slug', '')
        .not('country_code', 'is', null)
        .neq('country_code', ''),
      supabase
        .from('climbs')
        .select('id, crags!inner(id), route_lines!inner(id, images!inner(id))', { count: 'exact', head: true })
        .is('deleted_at', null)
        .not('slug', 'is', null)
        .neq('slug', '')
        .in('status', ['active', 'approved'])
        .eq('crags.publication_status', 'published')
        .is('crags.deleted_at', null)
        .is('crags.superseded_by', null)
        .not('crags.slug', 'is', null)
        .neq('crags.slug', '')
        .not('crags.country_code', 'is', null)
        .neq('crags.country_code', ''),
    ])

    if (cragResult.error || climbResult.error) {
      return new Response('Sitemap unavailable', { status: 500 })
    }

    for (let page = 0; page < getSitemapPageCount(cragResult.count); page += 1) {
      entries.push({ url: `${SITE_URL}/sitemaps/crags/${page}.xml`, lastModified: now })
    }

    for (let page = 0; page < getSitemapPageCount(climbResult.count); page += 1) {
      entries.push({ url: `${SITE_URL}/sitemaps/climbs/${page}.xml`, lastModified: now })
    }
  }

  return sitemapXmlResponse(renderSitemapIndex(entries))
}
