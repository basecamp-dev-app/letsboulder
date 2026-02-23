import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Gym Owners',
  description: 'letsboulder for gym owners and routesetters.',
}

export default function GymOwnersPage() {
  return (
    <div className="min-h-screen bg-white dark:bg-gray-950">
      <div className="mx-auto max-w-5xl px-4 py-10 md:py-14">
        <header className="rounded-2xl border border-gray-200 bg-gray-50 p-6 dark:border-gray-800 dark:bg-gray-900 md:p-8">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Gym Owners</p>
          <h1 className="mt-2 text-3xl font-bold text-gray-900 dark:text-gray-100 md:text-4xl">Manage climbs</h1>
        </header>

        <section className="mt-6 rounded-2xl border border-gray-200 bg-gray-50 p-6 dark:border-gray-800 dark:bg-gray-900 md:p-8">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">How it works</h2>
          <ol className="mt-3 space-y-2 text-sm text-gray-700 dark:text-gray-300">
            <li>1. Click apply and submit your gym details.</li>
            <li>2. We review your application and set up access.</li>
            <li>3. After approval, we contact you via WhatsApp.</li>
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
              Apply to try for free. After your application is approved, we will contact you via WhatsApp.
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
