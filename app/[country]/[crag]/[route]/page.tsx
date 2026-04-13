import type { Metadata } from 'next'
import { notFound, permanentRedirect } from 'next/navigation'
import { resolveRouteImageUrl } from '@/lib/media/route-image-url'
import { getUnauthenticatedClient } from '@/lib/supabase-server'
import { RouteLineWithImageSchema, type RouteLineWithImage } from '@/lib/supabase-result-schemas'

export const revalidate = 60

interface RouteParams {
  country: string
  crag: string
  route: string
}

interface CragRow {
  id: string
  name: string
  slug: string | null
  country_code: string | null
  region_name: string | null
  country: string | null
  countries:
    | {
        name: string
        regions:
          | { name: string; un_regions: { name: string; continent_name: string } | Array<{ name: string; continent_name: string }> | null }
          | Array<{ name: string; un_regions: { name: string; continent_name: string } | Array<{ name: string; continent_name: string }> | null }>
          | null
      }
    | Array<{
        name: string
        regions:
          | { name: string; un_regions: { name: string; continent_name: string } | Array<{ name: string; continent_name: string }> | null }
          | Array<{ name: string; un_regions: { name: string; continent_name: string } | Array<{ name: string; continent_name: string }> | null }>
          | null
      }>
    | null
  latitude: number | null
  longitude: number | null
}

interface ClimbRow {
  id: string
  shared_climb_id: string | null
  name: string | null
  slug: string | null
  grade: string
  description: string | null
  crag_id: string | null
  latitude: number | null
  longitude: number | null
}



function getSupabase() {
  return getUnauthenticatedClient()
}

async function getRoutePageData(countryCode: string, cragSlug: string, routeSlug: string) {
  const supabase = await getSupabase()

  const { data: crag } = await supabase
    .from('crags')
    .select('id, name, slug, country_code, region_name, country, latitude, longitude, countries:country_id(name, regions:region_id(name, un_regions:un_region_name(name, continent_name)))')
    .eq('country_code', countryCode)
    .eq('slug', cragSlug)
    .single()

  if (!crag) {
    return { crag: null, climb: null, bestImage: null, logCount: 0 }
  }

  const { data: climb } = await supabase
    .from('climbs')
    .select('id, shared_climb_id, name, slug, grade, description, crag_id, latitude, longitude')
    .eq('crag_id', (crag as CragRow).id)
    .eq('slug', routeSlug)
    .in('status', ['active', 'approved'])
    .single()

  if (!climb) {
    return { crag: crag as CragRow, climb: null, bestImage: null, logCount: 0 }
  }

  const effectiveClimbId = (climb as ClimbRow).shared_climb_id || (climb as ClimbRow).id

  const [{ data: routeLines }, { count: logCount }] = await Promise.all([
    supabase
      .from('route_lines')
      .select('id, image_id, sequence_order, images (id, url, is_verified, verification_count, created_at)')
      .eq('climb_id', (climb as ClimbRow).id),
    supabase
      .from('user_climbs')
      .select('id', { count: 'exact', head: true })
      .eq('climb_id', effectiveClimbId),
  ])

  const lines = RouteLineWithImageSchema.parse(routeLines || [])
  const bestImage = [...lines]
    .filter((line) => !!line.images?.url)
    .sort((a, b) => {
      const av = a.images?.is_verified ? 1 : 0
      const bv = b.images?.is_verified ? 1 : 0
      if (av !== bv) return bv - av
      const ac = a.images?.verification_count ?? 0
      const bc = b.images?.verification_count ?? 0
      if (ac !== bc) return bc - ac
      const ad = a.images?.created_at ? new Date(a.images.created_at).getTime() : 0
      const bd = b.images?.created_at ? new Date(b.images.created_at).getTime() : 0
      if (ad !== bd) return bd - ad
      return (a.id || '').localeCompare(b.id || '')
    })[0] || null

  return {
    crag: crag as CragRow,
    climb: climb as ClimbRow,
    bestImage,
    logCount: logCount || 0,
  }
}

export async function generateMetadata({ params }: { params: Promise<RouteParams> }): Promise<Metadata> {
  const { country, crag: cragSlug, route: routeSlug } = await params
  if (!country || country.length !== 2) return {}

  const countryCode = country.toUpperCase()

  const { crag, climb, bestImage } = await getRoutePageData(countryCode, cragSlug, routeSlug)

  if (!crag) return { title: 'Route Not Found' }

  if (!climb) return { title: 'Route Not Found' }

  const canonicalImageId = bestImage?.image_id || null
  const routeName = (climb.name || '').trim() || 'Route'
  const grade = climb.grade
  const title = `${routeName} (${grade}) | ${crag.name} Bouldering`
  const description = climb.description
    ? climb.description
    : `Topo, beta, and ascents for ${routeName} (${grade}) at ${crag.name}.`
  const canonicalPath = canonicalImageId
    ? `/${country.toLowerCase()}/${cragSlug}/i/${canonicalImageId}?route=${encodeURIComponent(routeSlug)}`
    : `/${country.toLowerCase()}/${cragSlug}/${routeSlug}`
  const imageUrl = bestImage?.images?.url ? resolveRouteImageUrl(bestImage.images.url) : '/og.png'

  return {
    title,
    description,
    robots: {
      index: true,
      follow: true,
    },
    alternates: {
      canonical: canonicalPath,
    },
    openGraph: {
      title,
      description,
      url: canonicalPath,
      images: [
        {
          url: imageUrl,
          width: 1200,
          height: 630,
          alt: `${routeName} (${grade}) topo at ${crag.name}`,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [imageUrl],
    },
  }
}

export default async function RoutePage({ params }: { params: Promise<RouteParams> }) {
  const { country, crag: cragSlug, route: routeSlug } = await params
  if (!country || country.length !== 2) notFound()

  const countryCode = country.toUpperCase()

  const { crag, climb, bestImage: best } = await getRoutePageData(countryCode, cragSlug, routeSlug)

  if (!crag) notFound()

  if (!climb) notFound()
  if (!best?.image_id) notFound()

  permanentRedirect(`/${country.toLowerCase()}/${cragSlug}/i/${best.image_id}?route=${encodeURIComponent(routeSlug)}`)
}
