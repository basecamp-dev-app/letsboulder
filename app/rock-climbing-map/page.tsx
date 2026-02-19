import type { Metadata } from 'next'
import Link from 'next/link'
import MapPage from '@/app/map/page'

export const metadata: Metadata = {
  title: 'Rock Climbing Map',
  description: 'Explore a rock climbing map focused on Guernsey. Find crags, open photo topos, and review route beta before sessions.',
  alternates: {
    canonical: '/rock-climbing-map',
  },
  openGraph: {
    title: 'Rock Climbing Map - letsboulder',
    description: 'Explore Guernsey rock climbing locations, photo topos, and route details on an interactive map.',
    url: '/rock-climbing-map',
    images: ['/og.png'],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Rock Climbing Map - letsboulder',
    description: 'Explore Guernsey rock climbing locations, photo topos, and route details on an interactive map.',
    images: ['/og.png'],
  },
}

export default function RockClimbingMapPage() {
  const webPageSchema = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: 'Rock Climbing Map',
    url: 'https://letsboulder.com/rock-climbing-map',
    description: 'Map-based rock climbing discovery for Guernsey with photo topos, crag pages, and route beta.',
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
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-100">Rock climbing map for Guernsey crags</h1>
          <p className="mt-3 max-w-3xl text-sm text-gray-600 dark:text-gray-300">
            Use the map to locate Guernsey crags, open route images, and check climb pages with grades and community-verified details.
          </p>

          <div className="mt-5 flex flex-wrap gap-2 text-sm">
            <Link href="/bouldering-map" className="rounded-md border border-gray-300 px-3 py-1.5 text-gray-900 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-100 dark:hover:bg-gray-900">Bouldering Map</Link>
            <Link href="/climbing-map" className="rounded-md border border-gray-300 px-3 py-1.5 text-gray-900 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-100 dark:hover:bg-gray-900">Climbing Map</Link>
            <Link href="/guernsey-bouldering" className="rounded-md border border-gray-300 px-3 py-1.5 text-gray-900 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-100 dark:hover:bg-gray-900">Guernsey Bouldering</Link>
            <Link href="/community" className="rounded-md border border-gray-300 px-3 py-1.5 text-gray-900 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-100 dark:hover:bg-gray-900">Community</Link>
          </div>
        </div>
      </section>
    </>
  )
}
