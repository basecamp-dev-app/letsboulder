import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Gym Owners - Climbing Gym Route Management',
  description: 'letsboulder helps climbing gyms manage routes and share updates with climbers.',
  alternates: {
    canonical: '/gym-owners',
  },
  openGraph: {
    title: 'Gym Owners - letsboulder',
    description: 'Manage gym routes on letsboulder, onboard your team, and keep climbers updated.',
    url: '/gym-owners',
    images: ['/og.png'],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Gym Owners - letsboulder',
    description: 'Manage gym routes on letsboulder, onboard your team, and keep climbers updated.',
    images: ['/og.png'],
  },
}

export default function GymOwnersPage() {
  const webPageSchema = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: 'Gym Owners - letsboulder',
    url: 'https://letsboulder.com/gym-owners',
    description: 'letsboulder for climbing gym route management, onboarding, and community updates.',
  }

  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      {
        '@type': 'Question',
        name: 'How do gym teams get started?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Apply from the gym owners page. After approval, the team is onboarded and contacted.',
        },
      },
    ],
  }

  return (
    <div className="min-h-screen bg-white dark:bg-gray-950">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(webPageSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />
      <div className="mx-auto max-w-5xl px-4 py-10 md:py-14">
        <header className="rounded-2xl border border-gray-200 bg-gray-50 p-6 dark:border-gray-800 dark:bg-gray-900 md:p-8">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Gym Owners</p>
          <h1 className="mt-2 text-3xl font-bold text-gray-900 dark:text-gray-100 md:text-4xl">Manage climbs</h1>
          <p className="mt-3 max-w-3xl text-sm text-gray-700 dark:text-gray-300">
            letsboulder gives climbing gyms a practical workflow to manage routes and keep local climbers up to date.
          </p>
          <p className="mt-2 text-sm text-gray-700 dark:text-gray-300">
            Contact us at <a href="mailto:team@letsboulder.com" className="underline">team@letsboulder.com</a> for more information.
          </p>
        </header>

        <section className="mt-6 rounded-2xl border border-gray-200 bg-gray-50 p-6 dark:border-gray-800 dark:bg-gray-900 md:p-8">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">How it works</h2>
          <ol className="mt-3 space-y-2 text-sm text-gray-700 dark:text-gray-300">
            <li>1. Click apply and submit your gym details.</li>
            <li>2. After approval, we&apos;ll create your interactive floor plan.</li>
            <li>3. Add your routes or boulders—you&apos;re in complete control of who sees them.</li>
          </ol>
          <p className="mt-3 text-sm text-gray-700 dark:text-gray-300">
            Your gym in letsboulder remains accessible only to you and the setters you invite until you&apos;re ready to make it available to your clients.
          </p>
        </section>

        <div className="mt-6">
          <Link
            href="/gym-owners/apply"
            className="block w-full rounded-md bg-gray-900 px-4 py-3 text-center text-base font-medium text-white hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-200 md:py-4 md:text-lg"
          >
            Apply
          </Link>
        </div>

      </div>
    </div>
  )
}
