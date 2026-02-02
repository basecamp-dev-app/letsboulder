import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { SITE_URL } from '@/lib/site'

interface CragParams {
  country: string
  crag: string
}

interface CragRow {
  id: string
  name: string
  slug: string | null
  country_code: string | null
  region_name: string | null
  country: string | null
  description: string | null
  rock_type: string | null
  type: string | null
  latitude: number | null
  longitude: number | null
}

async function getSupabase() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } }
  )
}

export async function generateMetadata({ params }: { params: Promise<CragParams> }): Promise<Metadata> {
  const { country, crag: cragSlug } = await params
  if (!country || country.length !== 2) return {}

  const supabase = await getSupabase()
  const countryCode = country.toUpperCase()

  const { data: crag } = await supabase
    .from('crags')
    .select('id, name, slug, country_code, region_name, country, description, rock_type, type, latitude, longitude')
    .eq('country_code', countryCode)
    .eq('slug', cragSlug)
    .single()

  if (!crag) return { title: 'Crag Not Found' }

  const cragData = crag as CragRow
  const title = `${cragData.name} - Climbing Crag`
  const description = cragData.description 
    ? `${cragData.description}` 
    : `Climbing routes and topos for ${cragData.name}${cragData.region_name ? ` in ${cragData.region_name}` : ''}.`

  return {
    title,
    description,
    alternates: {
      canonical: `/${country.toLowerCase()}/${cragSlug}`,
    },
    openGraph: {
      title,
      description,
      url: `/${country.toLowerCase()}/${cragSlug}`,
      images: [
        {
          url: '/og.png',
          width: 1200,
          height: 630,
          alt: title,
        },
      ],
    },
  }
}

export default async function CragSlugPage({ params }: { params: Promise<CragParams> }) {
  const { country, crag: cragSlug } = await params
  
  if (!country || country.length !== 2) {
    notFound()
  }

  const supabase = await getSupabase()
  const countryCode = country.toUpperCase()

  // Fetch crag by country_code + slug
  const { data: crag } = await supabase
    .from('crags')
    .select('id, name, slug, country_code, region_name, country, description, rock_type, type, latitude, longitude')
    .eq('country_code', countryCode)
    .eq('slug', cragSlug)
    .single()

  if (!crag) {
    notFound()
  }

  const cragData = crag as CragRow

  // Redirect to the ID-based crag page for full functionality
  // The ID-based page has all the client-side interactivity (map, offline support, etc.)
  // We use permanent redirect (301) for SEO benefits
  redirect(`/crag/${cragData.id}`)
}
