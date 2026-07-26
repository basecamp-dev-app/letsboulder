import type { Metadata } from 'next'
import OfflineRetryButton from '@/features/offline/components/OfflineRetryButton'

export const metadata: Metadata = {
  title: 'Offline',
  description: 'Connectivity information for letsboulder.',
  robots: {
    index: false,
    follow: false,
  },
}

export default function OfflinePage() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.12),_transparent_32%),linear-gradient(180deg,_#f8fafc_0%,_#eef2f7_100%)] px-4 py-10 text-gray-900 dark:bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.15),_transparent_28%),linear-gradient(180deg,_#020617_0%,_#111827_100%)] dark:text-gray-100">
      <div className="mx-auto max-w-2xl rounded-3xl border border-white/70 bg-white/90 p-6 shadow-xl shadow-emerald-950/5 backdrop-blur dark:border-white/10 dark:bg-gray-950/80 dark:shadow-black/30 sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-700 dark:text-cyan-300">Connection lost</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-gray-950 dark:text-white">You&apos;re offline</h1>
        <p className="mt-3 text-sm leading-6 text-gray-600 dark:text-gray-300">
          letsboulder needs a connection to load maps and climbing information. Check your signal and try again.
        </p>

        <div className="mt-6 rounded-2xl border border-cyan-200 bg-cyan-50/80 px-4 py-4 text-sm text-cyan-900 dark:border-cyan-900/60 dark:bg-cyan-950/30 dark:text-cyan-100">
          <p className="text-xs font-semibold uppercase tracking-[0.2em]">Connection required</p>
          <p className="mt-2">Keep this page open and try again when your connection returns.</p>
        </div>

        <div className="mt-8">
          <OfflineRetryButton />
        </div>
      </div>
    </main>
  )
}
