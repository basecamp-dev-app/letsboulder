import type { Metadata } from 'next'
import MapViewport from '@/components/MapViewport'
import JsonLd from '@/components/JsonLd'
import HomeContributorHighlights from '@/features/home/components/HomeContributorHighlights'
import HomeRecentCragUpdates from '@/features/home/components/HomeRecentCragUpdates'
import {
  fetchHomepageRecentContributors,
  fetchHomepageRecentCragUpdates,
  fetchHomepageTopContributors,
} from '@/features/home/server/homepage-data'
import { SITE_URL } from '@/lib/site'
import { fetchMapPins } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Climbing Map & Topos',
  description: 'Explore climbing on an interactive map, from Guernsey to Skye, with photo topos and route beta.',
  alternates: {
    canonical: '/',
  },
  openGraph: {
    title: 'Climbing Map & Topos - letsboulder',
    description: 'Explore climbing maps and photo topos from Guernsey to Skye, with route beta.',
    url: '/',
    images: [
      {
        url: '/og.png',
        width: 1200,
        height: 630,
        alt: 'Climbing Map & Topos - letsboulder',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Climbing Map & Topos - letsboulder',
    description: 'Explore climbing maps and photo topos from Guernsey to Skye, with route beta.',
    images: ['/og.png'],
  },
}

export default async function Home() {
  const [initialPlacePins, recentCragUpdates, recentContributors, topContributors] = await Promise.all([
    fetchMapPins(),
    fetchHomepageRecentCragUpdates(),
    fetchHomepageRecentContributors(),
    fetchHomepageTopContributors(),
  ])
  const siteNavigation = {
    '@context': 'https://schema.org',
    '@type': 'SiteNavigationElement',
    name: 'Main Navigation',
    item: [
      { name: 'Logbook', url: `${SITE_URL}/logbook` },
      { name: 'Upload Topos', url: `${SITE_URL}/submit` },
      { name: 'Bouldering Map', url: `${SITE_URL}/bouldering-map` },
      { name: 'Climbing Map', url: `${SITE_URL}/climbing-map` },
      { name: 'Rock Climbing Map', url: `${SITE_URL}/rock-climbing-map` },
      { name: 'Guernsey Bouldering', url: `${SITE_URL}/guernsey-bouldering` },
      { name: 'About', url: `${SITE_URL}/about` },
    ],
  }

  const webSite = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'letsboulder',
    url: SITE_URL,
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${SITE_URL}/search?q={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
    description: 'Interactive climbing map with photo topos and route beta for crags from Guernsey to Skye and beyond.',
  }

  return (
    <>
      <main className="min-h-screen bg-[linear-gradient(180deg,_rgba(248,250,252,0)_0%,_rgba(248,250,252,0.92)_28%,_#f8fafc_52%,_#f8fafc_100%)] dark:bg-[linear-gradient(180deg,_#020617_0%,_#020617_40%,_#020617_100%)]">
        <section className="w-full">
          <MapViewport
            initialPlacePins={initialPlacePins}
            mode="hero"
            className="h-[72svh] min-h-[540px] w-full md:h-[78svh] md:min-h-[680px]"
          />
        </section>

        <section className="relative z-10 -mt-14 mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 gap-4 rounded-[2rem] border border-white/60 bg-white/90 p-5 shadow-[0_22px_60px_-24px_rgba(15,23,42,0.35)] backdrop-blur dark:border-white/10 dark:bg-slate-950/78 md:grid-cols-3 md:gap-5 md:p-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">Map first</p>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight text-stone-950 dark:text-stone-50">Explore crags through the map, then keep scrolling.</h1>
              <p className="mt-3 text-sm leading-6 text-stone-600 dark:text-stone-300">Browse the map for the big picture, then dip into the latest crag updates and contributor credit below without losing the lightweight letsboulder feel.</p>
            </div>
            <div className="rounded-2xl border border-stone-200/80 bg-stone-50/85 p-4 dark:border-white/10 dark:bg-slate-900/80">
              <p className="text-sm font-semibold text-stone-900 dark:text-stone-50">Top crags area</p>
              <p className="mt-2 text-sm text-stone-600 dark:text-stone-300">Stay close to the map and scan the most active areas before diving into what was added recently.</p>
            </div>
            <div className="rounded-2xl border border-stone-200/80 bg-stone-50/85 p-4 dark:border-white/10 dark:bg-slate-900/80">
              <p className="text-sm font-semibold text-stone-900 dark:text-stone-50">Fresh community signal</p>
              <p className="mt-2 text-sm text-stone-600 dark:text-stone-300">Recent topos are grouped by crag, and public contributors get visible credit for the work that keeps the map current.</p>
            </div>
          </div>
        </section>

        <HomeRecentCragUpdates updates={recentCragUpdates} />
        <HomeContributorHighlights recentContributors={recentContributors} topContributors={topContributors} />
      </main>
      <JsonLd data={[siteNavigation, webSite]} />
    </>
  )
}
