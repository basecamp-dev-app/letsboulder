import type { Metadata } from 'next'
import { unstable_cache } from 'next/cache'
import { notFound, permanentRedirect } from 'next/navigation'
import { cache } from 'react'
import CragPageShell from '@/features/crags/components/CragPageShell'
import CragStructuredData from '@/features/crags/components/CragStructuredData'
import type { BreadcrumbItem, CragPageCrag } from '@/features/crags/lib/crag-page-types'
import { getCachedInitialCragRouteData } from '@/features/crags/server/crag-cache'
import { getCragSlugCacheTag } from '@/features/crags/server/crag-cache-tags'
import { getUnauthenticatedClient } from '@/lib/supabase-server'

export const revalidate = 3600

export function generateStaticParams() {
  return []
}

interface CragSlugParams {
  country: string
  crag: string
}

interface ResolvedCragSlug {
  country_code: string | null
  slug: string | null
  superseded_from: string | null
}

interface CragSlugRow {
  id: string
  name: string
  slug: string | null
  country_code: string | null
  region_name: string | null
  sub_area: string | null
  country: string | null
  latitude: number | null
  longitude: number | null
  region_id: string | null
  country_id: string | null
  description: string | null
  access_notes: string | null
  rock_type: string | null
  type: string | null
  climbing_areas: { id: string; name: string } | Array<{ id: string; name: string }> | null
  countries:
    | {
        id: string
        name: string
        regions:
          | {
              name: string
              un_regions: { name: string; continent_name: string } | Array<{ name: string; continent_name: string }> | null
            }
          | Array<{
              name: string
              un_regions: { name: string; continent_name: string } | Array<{ name: string; continent_name: string }> | null
            }>
          | null
      }
    | Array<{
        id: string
        name: string
        regions:
          | {
              name: string
              un_regions: { name: string; continent_name: string } | Array<{ name: string; continent_name: string }> | null
            }
          | Array<{
              name: string
              un_regions: { name: string; continent_name: string } | Array<{ name: string; continent_name: string }> | null
            }>
          | null
      }>
    | null
}

function getSupabase() {
  return getUnauthenticatedClient()
}

const resolveCragSlug = cache(async (countryCode: string, cragSlug: string) => {
  return unstable_cache(async () => {
    const supabase = await getSupabase()
    const { data } = await supabase
      .rpc('resolve_public_crag_slug', { p_country_code: countryCode, p_crag_slug: cragSlug })
      .maybeSingle()
    return data as ResolvedCragSlug | null
  }, ['resolve-public-crag-slug', countryCode, cragSlug], {
    revalidate: 60,
    tags: [getCragSlugCacheTag(countryCode, cragSlug)],
  })()
})

const getCragByCountrySlug = cache(async (countryCode: string, cragSlug: string): Promise<CragSlugRow | null> => {
  return unstable_cache(async () => {
    const supabase = await getSupabase()
    const { data } = await supabase
      .from('crags')
      .select(`
      id,
      name,
      slug,
      country_code,
      region_name,
      sub_area,
      country,
      latitude,
      longitude,
      region_id,
      country_id,
      description,
      access_notes,
      rock_type,
      type,
      climbing_areas:region_id (id, name),
      countries:country_id (
        id,
        name,
        regions:region_id (
          name,
          un_regions:un_region_name (name, continent_name)
        )
      )
      `)
      .eq('country_code', countryCode)
      .eq('slug', cragSlug)
      .eq('publication_status', 'published')
      .is('deleted_at', null)
      .is('superseded_by', null)
      .maybeSingle()

    return (data as CragSlugRow | null) || null
  }, ['public-crag-by-slug', countryCode, cragSlug], {
    revalidate: 60,
    tags: [getCragSlugCacheTag(countryCode, cragSlug)],
  })()
})

export async function generateMetadata({ params }: { params: Promise<CragSlugParams> }): Promise<Metadata> {
  const { country, crag: cragSlug } = await params
  if (!country || country.length !== 2) return {}

  const crag = await getCragByCountrySlug(country.toUpperCase(), cragSlug)

  if (!crag) {
    return {
      title: 'Crag Not Found',
      robots: { index: false, follow: true },
    }
  }

  const locationParts = [crag.region_name, crag.country].filter(Boolean) as string[]
  const title = locationParts.length > 0 ? `${crag.name}, ${locationParts[0]}` : `${crag.name}`
  const locationSuffix = locationParts.length > 0 ? ` in ${locationParts.join(', ')}` : ''
  const canonicalPath = `/${country.toLowerCase()}/${cragSlug}`
  const ogImagePath = `${canonicalPath}/opengraph-image`

  return {
    title,
    description: `View climbing routes at ${crag.name}${locationSuffix}. Discover photo topos, beta, access info, and nearby climbs.`,
    robots: {
      index: true,
      follow: true,
    },
    alternates: {
      canonical: canonicalPath,
    },
    openGraph: {
      title: `${title} | letsboulder`,
      description: `View climbing routes at ${crag.name}${locationSuffix}.`,
      url: canonicalPath,
      images: [
        {
          url: ogImagePath,
          width: 1200,
          height: 630,
          alt: `Climbing at ${crag.name}`,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: `${title} | letsboulder`,
      description: `View climbing routes at ${crag.name}${locationSuffix}.`,
      images: [ogImagePath],
    },
  }
}

export default async function CragSlugPage({
  params,
}: {
  params: Promise<CragSlugParams>
}) {
  const { country, crag: cragSlug } = await params
  if (!country || country.length !== 2) notFound()

  const countryCode = country.toUpperCase()
  const resolvedCrag = await resolveCragSlug(countryCode, cragSlug)
  if (resolvedCrag?.superseded_from && resolvedCrag.country_code && resolvedCrag.slug) {
    permanentRedirect(`/${resolvedCrag.country_code.toLowerCase()}/${resolvedCrag.slug}`)
  }
  const crag = await getCragByCountrySlug(countryCode, cragSlug)

  if (!crag) notFound()

  const countryRow = Array.isArray(crag.countries) ? crag.countries[0] : crag.countries
  const regionRow = Array.isArray(countryRow?.regions) ? countryRow.regions[0] : countryRow?.regions
  const unRegionRow = Array.isArray(regionRow?.un_regions) ? regionRow.un_regions[0] : regionRow?.un_regions

  const initialCrag: CragPageCrag = {
    ...crag,
    climbing_areas: Array.isArray(crag.climbing_areas) ? crag.climbing_areas[0] : crag.climbing_areas || undefined,
    country_id: crag.country_id,
    country_name: countryRow?.name,
    admin_region_name: regionRow?.name,
    un_region_name: unRegionRow?.name,
    continent_name: unRegionRow?.continent_name,
  }

  const canonicalPath = `/${country.toLowerCase()}/${cragSlug}`

  const breadcrumbs: BreadcrumbItem[] = [
    { label: 'Home', href: '/' },
    ...(initialCrag.continent_name ? [{ label: initialCrag.continent_name }] : []),
    ...(initialCrag.un_region_name ? [{ label: initialCrag.un_region_name }] : []),
    ...(initialCrag.admin_region_name ? [{ label: initialCrag.admin_region_name }] : []),
    ...(initialCrag.country_name || crag.country ? [{ label: initialCrag.country_name || crag.country || countryCode }] : [{ label: countryCode }]),
    ...(initialCrag.climbing_areas?.name ? [{ label: initialCrag.climbing_areas.name }] : []),
    { label: crag.name },
  ]
  const initialRouteData = await getCachedInitialCragRouteData(crag.id, {
    latitude: initialCrag.latitude,
    longitude: initialCrag.longitude,
  })

  return (
    <>
      <CragStructuredData crag={initialCrag} canonicalPath={canonicalPath} breadcrumbs={breadcrumbs} />
      <CragPageShell
        id={crag.id}
        initialCrag={initialCrag}
        initialImages={initialRouteData.initialImages}
        initialRoutes={initialRouteData.initialRoutes}
        initialRouteImageIdsByClimbId={initialRouteData.initialRouteImageIdsByClimbId}
        initialRoutePreviewByClimbId={initialRouteData.initialRoutePreviewByClimbId}
        initialDefaultRouteTargetByImageId={initialRouteData.initialDefaultRouteTargetByImageId}
        initialRouteNavigationTargetByClimbId={initialRouteData.initialRouteNavigationTargetByClimbId}
        initialCragCenter={initialRouteData.initialCragCenter}
        initialRouteTargetsComplete={initialRouteData.initialRouteTargetsComplete}
        initialCriticalImagesComplete={initialRouteData.initialCriticalImagesComplete}
        initialMapImagesComplete={initialRouteData.initialMapImagesComplete}
        initialPayloadLoadedAt={initialRouteData.loadedAt}
      />
    </>
  )
}
