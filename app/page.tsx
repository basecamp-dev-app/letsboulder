import type { Metadata } from 'next'
import { getServerClient } from '@/lib/supabase-server'
import MapViewport from '@/components/MapViewport'
import { SITE_URL } from '@/lib/site'

export const revalidate = 60

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

async function getSeoLinks() {
  const supabase = await getServerClient()

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
        dangerouslySetInnerHTML={{ __html: JSON.stringify([featuredCragsItemList, featuredRoutesItemList, siteNavigation, webSite]) }}
      />
    </>
  )
}
