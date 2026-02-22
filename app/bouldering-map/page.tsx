import type { Metadata } from 'next'
import Link from 'next/link'
import MapPage from '@/app/map/page'

export const metadata: Metadata = {
  title: 'Bouldering Map',
  description: 'Use this bouldering map to find crags from Guernsey to Skye, open photo topos, and check route beta before heading out.',
  alternates: {
    canonical: '/bouldering-map',
  },
  openGraph: {
    title: 'Bouldering Map - letsboulder',
    description: 'Find bouldering crags, photo topos, and route beta on an interactive map, including Scotland and the Channel Islands.',
    url: '/bouldering-map',
    images: ['/og.png'],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Bouldering Map - letsboulder',
    description: 'Find bouldering crags, photo topos, and route beta on an interactive map, including Scotland and the Channel Islands.',
    images: ['/og.png'],
  },
}

export default function BoulderingMapPage() {
  const webPageSchema = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: 'Bouldering Map',
    url: 'https://letsboulder.com/bouldering-map',
    description: 'Interactive bouldering map with photo topos, route beta, and local crag links, including Skye and Guernsey.',
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
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-100">Bouldering map for Skye, Guernsey, and beyond</h1>
          <p className="mt-3 max-w-3xl text-sm text-gray-600 dark:text-gray-300">
            Browse bouldering on a map-first interface, open photo topos, and move from crag discovery to route detail pages in a few taps.
          </p>

          <div className="mt-5 flex flex-wrap gap-2 text-sm">
            <Link href="/guernsey-bouldering" className="rounded-md border border-gray-300 px-3 py-1.5 text-gray-900 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-100 dark:hover:bg-gray-900">Guernsey Bouldering</Link>
            <Link href="/climbing-map" className="rounded-md border border-gray-300 px-3 py-1.5 text-gray-900 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-100 dark:hover:bg-gray-900">Climbing Map</Link>
            <Link href="/rock-climbing-map" className="rounded-md border border-gray-300 px-3 py-1.5 text-gray-900 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-100 dark:hover:bg-gray-900">Rock Climbing Map</Link>
            <Link href="/submit" className="rounded-md border border-gray-300 px-3 py-1.5 text-gray-900 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-100 dark:hover:bg-gray-900">Upload Topos</Link>
          </div>
        </div>
      </section>
    </>
  )
}
