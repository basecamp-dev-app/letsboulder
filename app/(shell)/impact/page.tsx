import type { Metadata } from 'next'
import Link from 'next/link'
import { ImpactCard } from '@/components/metrics/ImpactCard'
import { getPublicImpactMetrics } from '@/lib/supabase-server'

export const metadata: Metadata = {
  title: 'Community Impact',
  description: 'See the collective impact of our climbing community. Documented routes, mapped crags, successful sends, and community contributions.',
  keywords: ['climbing community', 'route documentation', 'impact metrics', 'climbing stats'],
}

export const revalidate = 60

export default async function ImpactPage() {
  const metrics = await getPublicImpactMetrics()
  const generatedAt = metrics
    ? new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' })
      .format(new Date(metrics.generatedAt))
    : null

  return (
    <div className="min-h-screen bg-white dark:bg-gray-950">
      <div className="container mx-auto max-w-6xl px-4 py-12">
        <div className="mx-auto mb-8 max-w-3xl text-center">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 md:text-4xl">
            Community impact
          </h1>
          <p className="mt-3 text-base text-gray-600 dark:text-gray-400">
            Every mapped crag, route topo, photo, and logged send helps make the guide more useful for the next climber. These totals refresh throughout the day.
          </p>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            {generatedAt ? `As of ${generatedAt} UTC · Definition version ${metrics?.definitionVersion}` : 'Metrics are temporarily unavailable.'}
          </p>
        </div>

        <dl className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          <ImpactCard
            title="Routes Documented"
            value={metrics?.routesDocumented ?? null}
            description="Published routes currently in the guide"
            className="rounded-3xl border border-gray-200 dark:border-gray-800"
          />
          <ImpactCard
            title="Crags Mapped"
            value={metrics?.cragsMapped ?? null}
            description="Crags with locations on the public map"
            className="rounded-3xl border border-gray-200 dark:border-gray-800"
          />
          <ImpactCard
            title="Sends Logged"
            value={metrics?.sendsLogged ?? null}
            description="Successful ascents recorded in community logbooks"
            className="rounded-3xl border border-gray-200 dark:border-gray-800"
          />
          <ImpactCard
            title="Active Climbers"
            value={metrics?.activeClimbers ?? null}
            description="Climbers who logged a send in the last 60 days"
            className="rounded-3xl border border-gray-200 dark:border-gray-800"
          />
          <ImpactCard
            title="Photos"
            value={metrics?.photos ?? null}
            description="Public climbing photos available in the guide"
            className="rounded-3xl border border-gray-200 dark:border-gray-800"
          />
          <ImpactCard
            title="Contributors"
            value={metrics?.contributors ?? null}
            description="People who have added routes or photos"
            className="rounded-3xl border border-gray-200 dark:border-gray-800"
          />
        </dl>

        <details className="mt-6 rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-950">
          <summary className="min-h-9 cursor-pointer font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            Metric definitions
          </summary>
          <dl className="mt-4 space-y-3 text-sm text-gray-600 dark:text-gray-400">
            <div><dt className="font-medium text-gray-900 dark:text-gray-100">Routes and crags</dt><dd>Discoverable, non-deleted content belonging to published crags.</dd></div>
            <div><dt className="font-medium text-gray-900 dark:text-gray-100">Sends</dt><dd>Ascents logged as top, flash, or onsight.</dd></div>
            <div><dt className="font-medium text-gray-900 dark:text-gray-100">Active climbers</dt><dd>Distinct climbers with a qualifying send during the rolling previous 60 days.</dd></div>
            <div><dt className="font-medium text-gray-900 dark:text-gray-100">Photos and contributors</dt><dd>Ready, public, approved guide photos and the distinct people behind discoverable routes or photos.</dd></div>
          </dl>
        </details>

        <section className="mt-10 rounded-3xl border border-gray-200 bg-gray-50 p-6 text-center dark:border-gray-800 dark:bg-gray-900 md:p-8">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Help the guide grow</h2>
          <p className="mx-auto mt-2 max-w-2xl text-sm text-gray-600 dark:text-gray-400">
            Add a route topo when you have local knowledge, or explore what the community has already documented.
          </p>
          <div className="mt-5 flex flex-col justify-center gap-3 sm:flex-row">
            <Link href="/submit" prefetch={false} className="inline-flex min-h-11 items-center justify-center rounded-xl bg-gray-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-200">
              Add topo
            </Link>
            <Link href="/" className="inline-flex min-h-11 items-center justify-center rounded-xl border border-gray-300 bg-white px-5 py-2.5 text-sm font-semibold text-gray-900 hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100 dark:hover:bg-gray-800">
              Explore the map
            </Link>
          </div>
        </section>
      </div>
    </div>
  )
}
