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
  description: string | null
  access_notes: string | null
  rock_type: string | null
  type: string | null
  regions: { id: string; name: string } | Array<{ id: string; name: string }> | null
}

async function getSupabase() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return [] }, setAll() {} } }
  )
}

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
      description,
      access_notes,
      rock_type,
      type,
      regions:region_id (id, name)
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
  if (!crag) notFound()

  const supabase = await getSupabase()

  const initialCrag: Crag = {
    ...crag,
    regions: Array.isArray(crag.regions) ? crag.regions[0] : crag.regions || undefined,
  }

  const canonicalPath = `/${country.toLowerCase()}/${cragSlug}`
  const breadcrumbs: BreadcrumbItem[] = [
    { label: 'Home', href: '/' },
    { label: countryCode },
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
