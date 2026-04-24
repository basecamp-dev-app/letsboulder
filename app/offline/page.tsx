import Link from 'next/link'
import type { Metadata } from 'next'
import { Button } from '@/components/ui/button'

export const metadata: Metadata = {
  title: 'Offline',
  description: 'Cached letsboulder content available on this device.',
  robots: {
    index: false,
    follow: false,
  },
}

export default function OfflinePage() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.12),_transparent_32%),linear-gradient(180deg,_#f8fafc_0%,_#eef2f7_100%)] px-4 py-10 text-gray-900 dark:bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.15),_transparent_28%),linear-gradient(180deg,_#020617_0%,_#111827_100%)] dark:text-gray-100">
      <div className="mx-auto max-w-2xl rounded-3xl border border-white/70 bg-white/90 p-6 shadow-xl shadow-emerald-950/5 backdrop-blur dark:border-white/10 dark:bg-gray-950/80 dark:shadow-black/30 sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-700 dark:text-cyan-300">Offline mode</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-gray-950 dark:text-white">Cached content only</h1>
        <p className="mt-3 text-sm leading-6 text-gray-600 dark:text-gray-300">
          This page was not available from the network or this device cache. Previously visited public pages and saved field content can still open while you are offline.
        </p>

        <div className="mt-6 rounded-2xl border border-cyan-200 bg-cyan-50/80 px-4 py-4 text-sm text-cyan-900 dark:border-cyan-900/60 dark:bg-cyan-950/30 dark:text-cyan-100">
          <p className="text-xs font-semibold uppercase tracking-[0.2em]">What works now</p>
          <p className="mt-2">Use pages already cached on this device. New searches, uncached routes, and live updates need a connection.</p>
        </div>

        <div className="mt-8 flex flex-wrap gap-3">
          <Button asChild className="rounded-xl">
            <Link href="/">Retry live map</Link>
          </Button>
          <Button asChild variant="outline" className="rounded-xl">
            <Link href="/offline/library">Open available locally</Link>
          </Button>
        </div>
      </div>
    </main>
  )
}
