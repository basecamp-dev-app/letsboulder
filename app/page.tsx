import type { Metadata } from 'next'
import MapViewport from '@/components/MapViewport'
import { SITE_URL } from '@/lib/site'

export const revalidate = 60

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
      { name: 'Community', url: `${SITE_URL}/community` },
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
      <MapViewport />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify([siteNavigation, webSite]) }}
      />
    </>
  )
}
