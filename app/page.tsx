import type { Metadata } from 'next'
import Link from 'next/link'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import MapPage from '@/app/map/page'
import { SITE_URL } from '@/lib/site'

interface SeoCrag {
  id: string
  name: string
  slug: string | null
  country_code: string | null
}

interface SeoClimb {
  id: string
  name: string | null
  grade: string
  slug: string | null
  crags?: Array<{
    slug: string | null
    country_code: string | null
    name: string | null
  }> | null
}

export const metadata: Metadata = {
  title: 'Interactive Climbing Map',
  description: 'Explore bouldering and climbing routes worldwide on an interactive map. Find crags, view photo topos, and discover new climbs.',
  alternates: {
    canonical: '/',
  },
  openGraph: {
    title: 'Interactive Climbing Map - letsboulder',
    description: 'Explore bouldering and climbing routes worldwide.',
    url: '/',
    images: [
      {
        url: '/og.png',
        width: 1200,
        height: 630,
        alt: 'Interactive Climbing Map - letsboulder',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Interactive Climbing Map - letsboulder',
    description: 'Explore bouldering and climbing routes worldwide.',
    images: ['/og.png'],
  },
}

async function getSeoLinks() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } }
  )

  const [cragsResult, climbsResult] = await Promise.all([
    supabase
      .from('crags')
      .select('id, name, slug, country_code')
      .order('updated_at', { ascending: false })
      .limit(4),
    supabase
      .from('climbs')
      .select('id, name, grade, slug, crags:crag_id (slug, country_code, name)')
      .eq('status', 'active')
      .order('updated_at', { ascending: false })
      .limit(6),
  ])

  return {
    crags: (cragsResult.data || []) as SeoCrag[],
    climbs: (climbsResult.data || []) as SeoClimb[],
  }
}

export default async function Home() {
  const { crags, climbs } = await getSeoLinks()

  const featuredCragsItemList = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Featured crags',
    itemListElement: crags.map((crag, index) => {
      const url = crag.slug && crag.country_code
        ? `${SITE_URL}/${crag.country_code.toLowerCase()}/${crag.slug}`
        : `${SITE_URL}/crag/${crag.id}`

      return {
        '@type': 'ListItem',
        position: index + 1,
        url,
        name: crag.name,
      }
    }),
  }

  const featuredRoutesItemList = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Featured routes',
    itemListElement: climbs.map((climb, index) => {
      const crag = Array.isArray(climb.crags) && climb.crags.length > 0 ? climb.crags[0] : null
      const url = climb.slug && crag?.slug && crag?.country_code
        ? `${SITE_URL}/${crag.country_code.toLowerCase()}/${crag.slug}/${climb.slug}`
        : `${SITE_URL}/climb/${climb.id}`

      return {
        '@type': 'ListItem',
        position: index + 1,
        url,
        name: climb.name || 'Unnamed route',
      }
    }),
  }

  return (
    <>
      <MapPage />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify([featuredCragsItemList, featuredRoutesItemList]) }}
      />

      <section className="relative z-10 mt-[100vh] border-t border-gray-200 bg-white/95 px-4 py-8 backdrop-blur-sm dark:border-gray-800 dark:bg-gray-950/95">
        <div className="mx-auto max-w-5xl">
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-100">Interactive bouldering map, topos, and route beta</h1>
          <p className="mt-3 max-w-3xl text-sm text-gray-600 dark:text-gray-300">
            letsboulder helps climbers discover crags, open photo topos, and navigate routes with precise map context. Start on the map above, then dive into route pages and crag guides.
          </p>

          <div className="mt-5 flex flex-wrap gap-2 text-sm">
            <Link href="/rankings" className="rounded-md border border-gray-300 px-3 py-1.5 text-gray-900 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-100 dark:hover:bg-gray-900">Rankings</Link>
            <Link href="/logbook" className="rounded-md border border-gray-300 px-3 py-1.5 text-gray-900 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-100 dark:hover:bg-gray-900">Logbook</Link>
            <Link href="/submit" className="rounded-md border border-gray-300 px-3 py-1.5 text-gray-900 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-100 dark:hover:bg-gray-900">Upload Topos</Link>
            <Link href="/about" className="rounded-md border border-gray-300 px-3 py-1.5 text-gray-900 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-100 dark:hover:bg-gray-900">About</Link>
          </div>

          {!!crags.length && (
            <div className="mt-6">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Featured crags</h2>
              <div className="mt-2 flex flex-wrap gap-2 text-sm">
                {crags.map((crag) => {
                  const href = crag.slug && crag.country_code
                    ? `/${crag.country_code.toLowerCase()}/${crag.slug}`
                    : `/crag/${crag.id}`

                  return (
                    <Link key={crag.id} href={href} className="text-blue-700 hover:underline dark:text-blue-300">
                      {crag.name}
                    </Link>
                  )
                })}
              </div>
            </div>
          )}

          {!!climbs.length && (
            <div className="mt-6">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Featured routes</h2>
              <div className="mt-2 grid gap-1 sm:grid-cols-2 md:grid-cols-3 text-sm">
                {climbs.map((climb) => {
                  const crag = Array.isArray(climb.crags) && climb.crags.length > 0 ? climb.crags[0] : null
                  const href = climb.slug && crag?.slug && crag?.country_code
                    ? `/${crag.country_code.toLowerCase()}/${crag.slug}/${climb.slug}`
                    : `/climb/${climb.id}`

                  return (
                    <Link key={climb.id} href={href} className="text-blue-700 hover:underline dark:text-blue-300">
                      {(climb.name || 'Unnamed route')} ({climb.grade})
                    </Link>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </section>
    </>
  )
}
