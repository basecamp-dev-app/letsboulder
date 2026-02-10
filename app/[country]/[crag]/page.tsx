import type { Metadata } from 'next'
import { createServerClient } from '@supabase/ssr'
import { notFound } from 'next/navigation'
import CragPageClient from '@/app/crag/components/CragPageClient'

export const revalidate = 60

interface CragSlugParams {
  country: string
  crag: string
}

async function getSupabase() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return [] }, setAll() {} } }
  )
}

export async function generateMetadata({ params }: { params: Promise<CragSlugParams> }): Promise<Metadata> {
  const { country, crag: cragSlug } = await params
  if (!country || country.length !== 2) return {}

  const supabase = await getSupabase()
  const countryCode = country.toUpperCase()

  const { data: crag } = await supabase
    .from('crags')
    .select('id, name, slug, country_code, region_name, country')
    .eq('country_code', countryCode)
    .eq('slug', cragSlug)
    .single()

  if (!crag) return { title: 'Crag Not Found' }

  const locationParts = [crag.region_name, crag.country].filter(Boolean) as string[]
  const title = locationParts.length > 0 ? `${crag.name}, ${locationParts[0]}` : `${crag.name}`
  const locationSuffix = locationParts.length > 0 ? ` in ${locationParts.join(', ')}` : ''
  const canonicalPath = `/${country.toLowerCase()}/${cragSlug}`

  return {
    title,
    description: `View climbing routes at ${crag.name}${locationSuffix}. Discover photo topos, beta, access info, and nearby climbs.`,
    alternates: {
      canonical: canonicalPath,
    },
    openGraph: {
      title: `${title} | letsboulder`,
      description: `View climbing routes at ${crag.name}${locationSuffix}.`,
      url: canonicalPath,
    },
    twitter: {
      card: 'summary_large_image',
      title: `${title} | letsboulder`,
      description: `View climbing routes at ${crag.name}${locationSuffix}.`,
      images: ['/og.png'],
    },
  }
}

export default async function CragSlugPage({ params }: { params: Promise<CragSlugParams> }) {
  const { country, crag: cragSlug } = await params
  if (!country || country.length !== 2) notFound()

  const supabase = await getSupabase()
  const { data: crag } = await supabase
    .from('crags')
    .select('id')
    .eq('country_code', country.toUpperCase())
    .eq('slug', cragSlug)
    .single()

  if (!crag) notFound()

  return (
    <>
      <CragPageClient id={crag.id} canonicalPath={`/${country.toLowerCase()}/${cragSlug}`} />
    </>
  )
}
