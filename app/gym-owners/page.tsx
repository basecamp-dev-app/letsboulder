import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Gym Owners - Climbing Gym Route Management',
  description: 'letsboulder helps climbing gyms manage routes and share updates with climbers. Free below 40 users, then GBP 60 per month over 40 users.',
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
        name: 'How much does letsboulder cost for gyms?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'letsboulder is free below 40 users and GBP 60 per month over 40 users.',
        },
      },
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
        </header>

        <section className="mt-6 rounded-2xl border border-gray-200 bg-gray-50 p-6 dark:border-gray-800 dark:bg-gray-900 md:p-8">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">How it works</h2>
          <ol className="mt-3 space-y-2 text-sm text-gray-700 dark:text-gray-300">
            <li>1. Click apply and submit your gym details.</li>
            <li>2. We review your application and set up access.</li>
            <li>3. After approval, we&apos;ll be in touch.</li>
          </ol>
        </section>

        <section className="mt-6 grid gap-4 md:grid-cols-2">
          <article className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900 md:p-8">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Pricing</h2>
            <div className="mt-3 space-y-2 text-sm text-gray-700 dark:text-gray-300">
              <p><span className="font-semibold text-gray-900 dark:text-gray-100">Free</span> below 40 users</p>
              <p><span className="font-semibold text-gray-900 dark:text-gray-100">£60 / month</span> over 40 users</p>
            </div>
          </article>

          <article className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900 md:p-8">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Try for free</h2>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              Apply to try for free. After approval, we&apos;ll be in touch.
            </p>
            <div className="mt-4">
              <Link
                href="/gym-owners/apply"
                className="inline-flex items-center rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-200"
              >
                Apply to try for free
              </Link>
            </div>
          </article>
        </section>

      </div>
    </div>
  )
}
