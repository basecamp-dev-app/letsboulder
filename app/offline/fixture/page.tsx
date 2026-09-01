import type { Metadata } from 'next'

import CragOfflinePackControl from '@/features/offline/components/CragOfflinePackControl'
import { PHASE_ONE_FIXTURE_CRAG_ID } from '@/features/offline/server/phase-one-offline-fixture'

export const metadata: Metadata = {
  title: 'Offline reliability fixture',
  robots: { index: false, follow: false },
}

export default function OfflineReliabilityFixturePage() {
  return (
    <main id="main-content" className="min-h-screen bg-stone-100 px-4 py-12 text-stone-950 dark:bg-gray-950 dark:text-white">
      <section className="mx-auto max-w-xl rounded-3xl border border-stone-200 bg-white p-7 dark:border-gray-800 dark:bg-gray-900">
        <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">Repository-owned test guide</p>
        <h1 className="mt-2 text-3xl font-semibold">Signal Lost Cove</h1>
        <p className="mt-3 text-sm leading-6 text-stone-600 dark:text-gray-300">Deterministic public data and immutable same-origin media for the mandatory offline reliability suite.</p>
        <div className="mt-6"><CragOfflinePackControl cragId={PHASE_ONE_FIXTURE_CRAG_ID} /></div>
      </section>
    </main>
  )
}
