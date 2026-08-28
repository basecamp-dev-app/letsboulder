import { Suspense } from 'react'
import type { Metadata } from 'next'
import JsonLd from '@/components/JsonLd'
import HomeMapHero from '@/features/home/components/HomeMapHero'
import HomeContributorHighlights from '@/features/home/components/HomeContributorHighlights'
import HomeRecentCragUpdates from '@/features/home/components/HomeRecentCragUpdates'
import {
  fetchHomepageRecentClimbLogs,
  fetchHomepageRecentContributors,
  fetchHomepageRecentCragUpdates,
} from '@/features/home/server/homepage-data'
import { SITE_URL } from '@/lib/site'

export const revalidate = 900

function RecentCragUpdatesFallback() {
  return (
    <section className="mx-auto w-full max-w-7xl px-4 pt-4 pb-8 sm:px-6 lg:px-8 lg:pt-5 lg:pb-10" aria-label="Loading recent crag updates">
      <div className="mb-4 h-8 w-64 rounded-full bg-stone-200/80 dark:bg-white/10" />
      <div className="grid grid-cols-1 gap-4 sm:gap-5 lg:grid-cols-3">
        {[0, 1, 2].map((index) => (
          <div key={index} className="overflow-hidden rounded-3xl border border-stone-200/80 bg-white/80 dark:border-white/10 dark:bg-slate-950/72">
            <div className="aspect-[16/9] animate-pulse bg-stone-200 dark:bg-white/10" />
            <div className="space-y-2 p-4 sm:p-5">
              <div className="h-5 w-2/3 rounded-full bg-stone-200 dark:bg-white/10" />
              <div className="h-4 w-1/2 rounded-full bg-stone-100 dark:bg-white/8" />
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

function ContributorHighlightsFallback() {
  return (
    <section className="mx-auto w-full max-w-7xl px-4 pb-14 sm:px-6 lg:px-8 lg:pb-18" aria-label="Loading contributor highlights">
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 lg:gap-6">
        {[0, 1].map((card) => (
          <div key={card} className="rounded-3xl border border-stone-200/80 bg-white/80 p-4 dark:border-white/10 dark:bg-slate-950/72 sm:p-5">
            <div className="mb-4 h-6 w-44 rounded-full bg-stone-200 dark:bg-white/10" />
            {[0, 1, 2].map((row) => (
              <div key={row} className="mb-3 flex items-center gap-3 rounded-2xl border border-stone-200/80 bg-white/80 px-3 py-2.5 dark:border-white/10 dark:bg-slate-950/55">
                <div className="h-10 w-10 rounded-full bg-stone-200 dark:bg-white/10" />
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="h-4 w-2/3 rounded-full bg-stone-200 dark:bg-white/10" />
                  <div className="h-3 w-1/2 rounded-full bg-stone-100 dark:bg-white/8" />
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </section>
  )
}

async function RecentCragUpdatesSection() {
  const recentCragUpdates = await fetchHomepageRecentCragUpdates()
  return <HomeRecentCragUpdates updates={recentCragUpdates} />
}

async function ContributorHighlightsSection() {
  const [recentContributors, recentClimbLogs] = await Promise.all([
    fetchHomepageRecentContributors(),
    fetchHomepageRecentClimbLogs(),
  ])

  return <HomeContributorHighlights recentContributors={recentContributors} recentClimbLogs={recentClimbLogs} />
}

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
  const siteNavigation = {
    '@context': 'https://schema.org',
    '@type': 'SiteNavigationElement',
    name: 'Main Navigation',
    item: [
      { name: 'Logbook', url: `${SITE_URL}/logbook` },
      { name: 'Add topo', url: `${SITE_URL}/submit` },
      { name: 'For gym owners', url: `${SITE_URL}/gym-owners` },
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
      <div className="min-h-screen bg-[linear-gradient(180deg,_rgba(248,250,252,0)_0%,_rgba(248,250,252,0.82)_22%,_#f8fafc_42%,_#f8fafc_100%)] dark:bg-[linear-gradient(180deg,_#020617_0%,_#020617_34%,_#020617_100%)]">
        <section className="relative w-full">
          <HomeMapHero className="h-[58svh] min-h-[420px] w-full md:h-[54svh] md:min-h-[480px]" />
          <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-slate-950/20 via-slate-950/5 to-transparent" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-slate-50 via-slate-50/70 to-transparent dark:from-slate-950 dark:via-slate-950/70" />
        </section>

        <Suspense fallback={<RecentCragUpdatesFallback />}>
          <RecentCragUpdatesSection />
        </Suspense>
        <Suspense fallback={<ContributorHighlightsFallback />}>
          <ContributorHighlightsSection />
        </Suspense>
      </div>
      <JsonLd data={[siteNavigation, webSite]} />
    </>
  )
}
