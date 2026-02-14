import type { Metadata } from 'next'
import Link from 'next/link'
import MapPage from '@/app/map/page'

export const metadata: Metadata = {
  title: 'Guernsey Bouldering Map',
  description: 'Discover Guernsey bouldering on an interactive map with local crags, photo topos, and route beta from the climbing community.',
  alternates: {
    canonical: '/guernsey-bouldering',
  },
  openGraph: {
    title: 'Guernsey Bouldering Map - letsboulder',
    description: 'Discover Guernsey bouldering crags, photo topos, and route details on an interactive map.',
    url: '/guernsey-bouldering',
    images: ['/og.png'],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Guernsey Bouldering Map - letsboulder',
    description: 'Discover Guernsey bouldering crags, photo topos, and route details on an interactive map.',
    images: ['/og.png'],
  },
}

export default function GuernseyBoulderingPage() {
  const webPageSchema = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: 'Guernsey Bouldering Map',
    url: 'https://letsboulder.com/guernsey-bouldering',
    description: 'Guernsey bouldering map with photo topos, route beta, and direct links to local crag pages.',
    about: 'Bouldering in Guernsey',
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
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-100">Guernsey bouldering map and topos</h1>
          <p className="mt-3 max-w-3xl text-sm text-gray-600 dark:text-gray-300">
            letsboulder currently focuses on Guernsey. Use the map above to find local bouldering areas, open photo topos, and move quickly into route detail pages.
          </p>

          <div className="mt-5 flex flex-wrap gap-2 text-sm">
            <Link href="/bouldering-map" className="rounded-md border border-gray-300 px-3 py-1.5 text-gray-900 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-100 dark:hover:bg-gray-900">Bouldering Map</Link>
            <Link href="/climbing-map" className="rounded-md border border-gray-300 px-3 py-1.5 text-gray-900 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-100 dark:hover:bg-gray-900">Climbing Map</Link>
            <Link href="/rock-climbing-map" className="rounded-md border border-gray-300 px-3 py-1.5 text-gray-900 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-100 dark:hover:bg-gray-900">Rock Climbing Map</Link>
            <Link href="/submit" className="rounded-md border border-gray-300 px-3 py-1.5 text-gray-900 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-100 dark:hover:bg-gray-900">Upload Topos</Link>
          </div>
        </div>
      </section>
    </>
  )
}
