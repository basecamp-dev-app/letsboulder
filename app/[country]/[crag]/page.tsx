import type { Metadata } from 'next'
import { createServerClient } from '@supabase/ssr'
import { notFound } from 'next/navigation'
import { cache } from 'react'
import CragPageClient from '@/app/crag/components/CragPageClient'
import { loadInitialCragRouteData } from '@/app/crag/components/crag-page-server'
import type { Crag } from '@/app/crag/components/CragPageClient'
import CragStructuredData from '@/app/crag/components/CragStructuredData'
import type { BreadcrumbItem } from '@/app/crag/components/crag-page-types'
import { loadPlaceCommunityData } from '@/features/community/server/load-place-community-data'

export const revalidate = 60

interface CragSlugParams {
  country: string
  crag: string
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

async function getSupabase() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return [] }, setAll() {} } }
  )
}

// Temporarily removed cache() to test - will add back after debugging
const getCragByCountrySlug = cache(async (countryCode: string, cragSlug: string): Promise<CragSlugRow | null> => {
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
    .maybeSingle()

  return (data as CragSlugRow | null) || null
})

export async function generateMetadata({ params }: { params: Promise<CragSlugParams> }): Promise<Metadata> {
  const { country, crag: cragSlug } = await params
  if (!country || country.length !== 2) return {}

  const crag = await getCragByCountrySlug(country.toUpperCase(), cragSlug)

  if (!crag) return { title: 'Crag Not Found' }

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

export default async function CragSlugPage({ params }: { params: Promise<CragSlugParams> }) {
  const { country, crag: cragSlug } = await params
  if (!country || country.length !== 2) notFound()

  const countryCode = country.toUpperCase()
  const crag = await getCragByCountrySlug(countryCode, cragSlug)
  
  if (!crag) {
    notFound()
  }

  const supabase = await getSupabase()

  const initialCrag: Crag = {
    ...crag,
    climbing_areas: Array.isArray(crag.climbing_areas) ? crag.climbing_areas[0] : crag.climbing_areas || undefined,
    country_id: crag.country_id,
    country_name: Array.isArray(crag.countries) ? crag.countries[0]?.name : crag.countries?.name,
    admin_region_name: Array.isArray(Array.isArray(crag.countries) ? crag.countries[0]?.regions : crag.countries?.regions)
      ? (Array.isArray(crag.countries) ? crag.countries[0]?.regions : crag.countries?.regions)?.[0]?.name
      : (Array.isArray(crag.countries) ? crag.countries[0]?.regions : crag.countries?.regions)?.name,
    un_region_name: (() => {
      const countryRow = Array.isArray(crag.countries) ? crag.countries[0] : crag.countries
      const regionRow = Array.isArray(countryRow?.regions) ? countryRow.regions[0] : countryRow?.regions
      const unRegionRow = Array.isArray(regionRow?.un_regions) ? regionRow.un_regions[0] : regionRow?.un_regions
      return unRegionRow?.name
    })(),
    continent_name: (() => {
      const countryRow = Array.isArray(crag.countries) ? crag.countries[0] : crag.countries
      const regionRow = Array.isArray(countryRow?.regions) ? countryRow.regions[0] : countryRow?.regions
      const unRegionRow = Array.isArray(regionRow?.un_regions) ? regionRow.un_regions[0] : regionRow?.un_regions
      return unRegionRow?.continent_name
    })(),
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
  const communityData = await loadPlaceCommunityData(supabase, crag.id)
  const initialRouteData = await loadInitialCragRouteData(supabase as never, crag.id, {
    latitude: initialCrag.latitude,
    longitude: initialCrag.longitude,
  })

  return (
    <>
      <CragStructuredData
        crag={initialCrag}
        canonicalPath={canonicalPath}
        breadcrumbs={breadcrumbs}
      />
      <CragPageClient
        id={crag.id}
        initialCrag={initialCrag}
        initialImages={initialRouteData.initialImages}
        initialRoutes={initialRouteData.initialRoutes}
        initialRoutePreviewByClimbId={initialRouteData.initialRoutePreviewByClimbId}
        initialCragCenter={initialRouteData.initialCragCenter}
        communityPlaceId={communityData.placeId}
        communityPlaceSlug={communityData.placeSlug}
        initialSessionPosts={communityData.sessionPosts}
        initialUpdatePosts={communityData.updatePosts}
      />
    </>
  )
}
