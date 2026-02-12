import type { Metadata } from 'next'
import Link from 'next/link'
import MapPage from '@/app/map/page'

export const metadata: Metadata = {
  title: 'Climbing Map',
  description: 'Use this climbing map to explore Guernsey crags, view route lines, and open photo topos for local climbs.',
  alternates: {
    canonical: '/climbing-map',
  },
  openGraph: {
    title: 'Climbing Map - letsboulder',
    description: 'Explore Guernsey climbing routes and photo topos on an interactive map.',
    url: '/climbing-map',
    images: ['/og.png'],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Climbing Map - letsboulder',
    description: 'Explore Guernsey climbing routes and photo topos on an interactive map.',
    images: ['/og.png'],
  },
}

export default function ClimbingMapPage() {
  const webPageSchema = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: 'Climbing Map',
    url: 'https://letsboulder.com/climbing-map',
    description: 'Interactive climbing map for Guernsey with topo images, route detail pages, and community beta.',
  }

  return (
    <>
      <MapPage />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(webPageSchema) }}
      />

      <section className="relative z-10 mt-[100vh] border-t border-gray-200 bg-white/95 px-4 py-8 backdrop-blur-sm dark:border-gray-800 dark:bg-gray-950/95">
        <div className="mx-auto max-w-5xl">
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-100">Interactive climbing map for Guernsey</h1>
          <p className="mt-3 max-w-3xl text-sm text-gray-600 dark:text-gray-300">
            View Guernsey climbing locations on the map, open photo topos, and jump directly to route pages with grade and route beta.
          </p>

          <div className="mt-5 flex flex-wrap gap-2 text-sm">
            <Link href="/bouldering-map" className="rounded-md border border-gray-300 px-3 py-1.5 text-gray-900 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-100 dark:hover:bg-gray-900">Bouldering Map</Link>
            <Link href="/rock-climbing-map" className="rounded-md border border-gray-300 px-3 py-1.5 text-gray-900 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-100 dark:hover:bg-gray-900">Rock Climbing Map</Link>
            <Link href="/guernsey-bouldering" className="rounded-md border border-gray-300 px-3 py-1.5 text-gray-900 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-100 dark:hover:bg-gray-900">Guernsey Bouldering</Link>
            <Link href="/logbook" className="rounded-md border border-gray-300 px-3 py-1.5 text-gray-900 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-100 dark:hover:bg-gray-900">Logbook</Link>
          </div>
        </div>
      </section>
    </>
  )
}
