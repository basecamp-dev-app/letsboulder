import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createServerClient } from '@supabase/ssr'
import { SITE_URL } from '@/lib/site'

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
}

interface ClimbRow {
  id: string
  name: string | null
  slug: string | null
  grade: string
  description: string | null
  crag_id: string | null
}

interface RouteLineWithImage {
  id: string
  image_id: string
  sequence_order: number | null
  images: {
    id: string
    url: string
    is_verified: boolean
    verification_count: number
    created_at: string
  } | null
}

async function getSupabase() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return [] }, setAll() {} } }
  )
}

export async function generateMetadata({ params }: { params: Promise<RouteParams> }): Promise<Metadata> {
  const { country, crag: cragSlug, route: routeSlug } = await params
  if (!country || country.length !== 2) return {}

  const supabase = await getSupabase()
  const countryCode = country.toUpperCase()

  const { data: crag } = await supabase
    .from('crags')
    .select('id, name, slug, country_code, region_name, country')
    .eq('country_code', countryCode)
    .eq('slug', cragSlug)
    .single()

  if (!crag) return { title: 'Route Not Found' }

  const { data: climb } = await supabase
    .from('climbs')
    .select('id, name, slug, grade, description, crag_id')
    .eq('crag_id', (crag as CragRow).id)
    .eq('slug', routeSlug)
    .single()

  if (!climb) return { title: 'Route Not Found' }

  const routeName = ((climb as ClimbRow).name || '').trim() || 'Route'
  const grade = (climb as ClimbRow).grade
  const title = `${routeName} (${grade}) - ${(crag as CragRow).name}`
  const description = (climb as ClimbRow).description
    ? `${(climb as ClimbRow).description}`
    : `Topo, beta, and ascents for ${routeName} (${grade}) at ${(crag as CragRow).name}.`

  return {
    title,
    description,
    robots: {
      index: false,
      follow: true,
    },
    alternates: {
      canonical: `/${country.toLowerCase()}/${cragSlug}/${routeSlug}`,
    },
    openGraph: {
      title,
      description,
      url: `/${country.toLowerCase()}/${cragSlug}/${routeSlug}`,
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

export default async function RoutePage({ params }: { params: Promise<RouteParams> }) {
  const { country, crag: cragSlug, route: routeSlug } = await params
  if (!country || country.length !== 2) notFound()

  const supabase = await getSupabase()
  const countryCode = country.toUpperCase()

  const { data: crag } = await supabase
    .from('crags')
    .select('id, name, slug, country_code, region_name, country')
    .eq('country_code', countryCode)
    .eq('slug', cragSlug)
    .single()

  if (!crag) notFound()

  const { data: climb } = await supabase
    .from('climbs')
    .select('id, name, slug, grade, description, crag_id')
    .eq('crag_id', (crag as CragRow).id)
    .eq('slug', routeSlug)
    .single()

  if (!climb) notFound()

  const { data: routeLines } = await supabase
    .from('route_lines')
    .select('id, image_id, sequence_order, images (id, url, is_verified, verification_count, created_at)')
    .eq('climb_id', (climb as ClimbRow).id)

  const lines = (routeLines || []) as unknown as RouteLineWithImage[]
  const best = [...lines]
    .filter((l) => !!l.images?.url)
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
    })[0]

  const { count: logCount } = await supabase
    .from('user_climbs')
    .select('id', { count: 'exact', head: true })
    .eq('climb_id', (climb as ClimbRow).id)

  const routeName = ((climb as ClimbRow).name || '').trim() || 'Route'
  const grade = (climb as ClimbRow).grade
  const locationBits = [(crag as CragRow).region_name, (crag as CragRow).country].filter(Boolean).join(', ')

  return (
    <div className="min-h-screen bg-white dark:bg-gray-950">
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="mb-6">
          <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
            {country.toLowerCase()} / {(crag as CragRow).name}
          </p>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mt-1">
            {routeName}
          </h1>
          <div className="mt-2 flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center rounded-full bg-gray-100 dark:bg-gray-800 px-2.5 py-1 text-sm font-medium text-gray-900 dark:text-gray-100">
              {grade}
            </span>
            {locationBits && (
              <span className="text-sm text-gray-600 dark:text-gray-400">{locationBits}</span>
            )}
            <span className="text-sm text-gray-600 dark:text-gray-400">
              {logCount || 0} logged ascent{(logCount || 0) === 1 ? '' : 's'}
            </span>
          </div>
        </div>

        {(climb as ClimbRow).description && (
          <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 mb-6">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">Description</h2>
            <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{(climb as ClimbRow).description}</p>
          </div>
        )}

        {best?.images?.url ? (
          <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">Topo</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Open the interactive topo to see this line highlighted.
            </p>
            <div className="flex gap-2 flex-wrap">
              <Link
                href={`/image/${best.images.id}?route=${best.id}`}
                className="inline-flex items-center justify-center rounded-lg bg-gray-900 text-white px-4 py-2 text-sm font-medium hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-200"
              >
                View Interactive Topo
              </Link>
              <Link
                href={`/${country.toLowerCase()}/${cragSlug}`}
                className="inline-flex items-center justify-center rounded-lg border border-gray-300 dark:border-gray-700 px-4 py-2 text-sm font-medium text-gray-900 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                View Crag
              </Link>
            </div>
            <div className="mt-4 rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-950">
              <img
                src={best.images.url}
                alt={`${routeName} topo photo`}
                className="w-full max-h-[60vh] object-contain"
                loading="lazy"
              />
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">Topo</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              No topo image is linked to this route yet.
            </p>
          </div>
        )}

        <div className="mt-6 text-xs text-gray-500 dark:text-gray-500">
          <span className="tabular-nums">{SITE_URL}</span>
        </div>
      </div>
    </div>
  )
}
