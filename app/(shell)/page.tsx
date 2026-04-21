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
      { name: 'Gym Owners', url: `${SITE_URL}/gym-owners` },
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
            className="h-[72svh] min-h-[540px] w-full md:h-[64svh] md:min-h-[600px]"
          />
        </section>

        <HomeRecentCragUpdates updates={recentCragUpdates} />
        <HomeContributorHighlights recentContributors={recentContributors} topContributors={topContributors} />
      </main>
      <JsonLd data={[siteNavigation, webSite]} />
    </>
  )
}
