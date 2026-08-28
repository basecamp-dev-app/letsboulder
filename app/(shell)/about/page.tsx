import { Metadata } from 'next'
import Link from 'next/link'
import SupportCard from '@/components/SupportCard'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { SOURCE_REPOSITORY_URL } from '@/lib/site'

export const metadata: Metadata = {
  title: 'About',
  description: 'Learn about letsboulder. Discover routes, log your ascents, and contribute to a community-driven climbing database.',
  alternates: {
    canonical: '/about',
  },
  openGraph: {
    title: 'About letsboulder',
    description: 'Learn about a community-driven climbing platform.',
    url: '/about',
    images: [
      {
        url: '/og.png',
        width: 1200,
        height: 630,
        alt: 'About letsboulder',
      },
    ],
  },
}

export default function AboutPage() {
  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl">
      <div className="space-y-8 text-gray-900 dark:text-gray-300">
        <section>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-4">
            About letsboulder
          </h1>
          <p className="text-base text-gray-600 dark:text-gray-400">
            letsboulder is a community climbing map, logbook, and field guide built to stay genuinely useful: fast to open, easy to contribute to, and free for everyone.
          </p>
        </section>

        <Card>
          <CardHeader>
            <CardTitle><h2>Our Mission</h2></CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <ul className="list-disc list-inside space-y-2 ml-2">
              <li>Document bouldering locations and their history</li>
              <li>Make route information accessible to everyone</li>
              <li>Help climbers track their personal progress</li>
              <li>Keep the app free, ad-free, and community-first</li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle><h2>How It Works</h2></CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="list-decimal list-inside space-y-3">
              <li><strong>Find climbs</strong> on our interactive satellite map</li>
              <li><strong>Log your ascents</strong> - flash, top, or try</li>
              <li><strong>Track progress</strong> with grade history and pyramids</li>
            </ol>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle><h2>Community Features</h2></CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc list-inside space-y-2">
              <li>Submit and name new routes</li>
              <li>Contribute photos of climbs</li>
              <li>Report errors or suggest corrections</li>
            </ul>
          </CardContent>
        </Card>

        <SupportCard />

        <section className="rounded-2xl border border-gray-200 bg-gray-50 p-5 dark:border-gray-800 dark:bg-gray-900/50">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Help and contact</h2>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            For questions, corrections, or account help, email{' '}
            <a href="mailto:hello@letsboulder.com" className="font-medium underline underline-offset-4 hover:text-gray-900 dark:hover:text-gray-100">
              hello@letsboulder.com
            </a>.
          </p>
          <Link href="/impact" className="mt-4 inline-flex min-h-9 items-center rounded-md text-sm font-medium underline underline-offset-4 hover:text-gray-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:hover:text-gray-300">
            See the community impact
          </Link>
          <a
            className="ml-4 mt-4 inline-flex min-h-9 items-center rounded-md text-sm font-medium underline underline-offset-4 hover:text-gray-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:hover:text-gray-300"
            href={SOURCE_REPOSITORY_URL}
            rel="noopener noreferrer"
            target="_blank"
          >
            View source code (opens in a new tab)
          </a>
        </section>
      </div>
    </div>
  )
}
