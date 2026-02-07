import type { Metadata } from 'next'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import CragPageClient from '@/app/crag/components/CragPageClient'

interface CragSlugParams {
  country: string
  crag: string
}

async function getSupabase() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } }
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

  const { data: climbs } = await supabase
    .from('climbs')
    .select('id, name, grade, slug')
    .eq('crag_id', crag.id)
    .eq('status', 'active')
    .not('slug', 'is', null)
    .order('updated_at', { ascending: false })
    .limit(24)

  return (
    <>
      <CragPageClient id={crag.id} canonicalPath={`/${country.toLowerCase()}/${cragSlug}`} />
      {!!climbs?.length && (
        <section className="mx-auto max-w-4xl px-4 pb-12">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Routes at this crag</h2>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {climbs.map((climb) => (
              <Link
                key={climb.id}
                href={`/${country.toLowerCase()}/${cragSlug}/${climb.slug}`}
                className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 transition-colors hover:border-blue-400 hover:bg-gray-50 dark:border-gray-800 dark:text-gray-200 dark:hover:border-blue-500 dark:hover:bg-gray-900"
              >
                <span className="font-medium">{climb.name || 'Unnamed route'}</span>
                <span className="ml-2 text-gray-500 dark:text-gray-400">{climb.grade}</span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </>
  )
}
