import { getUnauthenticatedClient } from '@/lib/supabase-server'
import { buildImageFirstPath } from '@/lib/routes/image-first-path'
import { SITE_URL } from '@/lib/site'
import type { Database } from '@/types/database'
import {
  getSitemapPageRange,
  hasSitemapDataSource,
  renderUrlSet,
  sitemapXmlResponse,
  type SitemapEntry,
} from '@/lib/sitemap/xml'

export const revalidate = 3600

type ClimbRow = Database['public']['Tables']['climbs']['Row']
type CragRow = Database['public']['Tables']['crags']['Row']
type ImageRow = Database['public']['Tables']['images']['Row']
type RouteLineRow = Database['public']['Tables']['route_lines']['Row']

type SitemapImageRow = Pick<ImageRow, 'id' | 'url' | 'is_verified' | 'verification_count' | 'created_at'>

type SitemapRouteLineRow = Pick<RouteLineRow, 'id' | 'image_id'> & {
  images: SitemapImageRow | SitemapImageRow[] | null
}

export type SitemapClimbRow = Pick<ClimbRow, 'id' | 'shared_climb_id' | 'slug' | 'updated_at'> & {
  crags:
    | Pick<CragRow, 'slug' | 'country_code'>
    | Array<Pick<CragRow, 'slug' | 'country_code'>>
    | null
  route_lines: SitemapRouteLineRow[]
}

export function buildSitemapClimbEntry(climb: SitemapClimbRow): SitemapEntry | null {
  const crag = Array.isArray(climb.crags) ? climb.crags[0] : climb.crags
  const bestRouteLine = [...climb.route_lines]
    .filter((line) => {
      const image = Array.isArray(line.images) ? line.images[0] : line.images
      return Boolean(image?.url)
    })
    .sort((a, b) => {
      const aImage = Array.isArray(a.images) ? a.images[0] : a.images
      const bImage = Array.isArray(b.images) ? b.images[0] : b.images
      const av = aImage?.is_verified ? 1 : 0
      const bv = bImage?.is_verified ? 1 : 0
      if (av !== bv) return bv - av
      const ac = aImage?.verification_count ?? 0
      const bc = bImage?.verification_count ?? 0
      if (ac !== bc) return bc - ac
      const ad = aImage?.created_at ? new Date(aImage.created_at).getTime() : 0
      const bd = bImage?.created_at ? new Date(bImage.created_at).getTime() : 0
      if (ad !== bd) return bd - ad
      return a.id.localeCompare(b.id)
    })[0]

  if (!climb.slug || !crag?.slug || !crag.country_code || !bestRouteLine) return null

  return {
    url: `${SITE_URL}${buildImageFirstPath({
      countryCode: crag.country_code,
      cragSlug: crag.slug,
      imageId: bestRouteLine.image_id,
      route: climb.slug,
      climbId: climb.shared_climb_id || climb.id,
    })}`,
    lastModified: climb.updated_at ? new Date(climb.updated_at) : undefined,
  }
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
    .select(`
      id,
      shared_climb_id,
      slug,
      updated_at,
      crags!inner(slug, country_code),
      route_lines!inner(
        id,
        image_id,
        images!inner(id, url, is_verified, verification_count, created_at)
      )
    `)
    .is('deleted_at', null)
    .not('slug', 'is', null)
    .neq('slug', '')
    .in('status', ['active', 'approved'])
    .not('crags.slug', 'is', null)
    .neq('crags.slug', '')
    .not('crags.country_code', 'is', null)
    .neq('crags.country_code', '')
    .order('updated_at', { ascending: false, nullsFirst: false })
    .order('slug', { ascending: true })
    .order('id', { ascending: true })
    .range(range.from, range.to)

  if (error) {
    return new Response('Sitemap unavailable', { status: 500 })
  }

  const entries: SitemapEntry[] = ((data || []) as SitemapClimbRow[])
    .map(buildSitemapClimbEntry)
    .filter((entry): entry is SitemapEntry => entry !== null)

  if (entries.length === 0) {
    return new Response('Not Found', { status: 404 })
  }

  return sitemapXmlResponse(renderUrlSet(entries))
}
