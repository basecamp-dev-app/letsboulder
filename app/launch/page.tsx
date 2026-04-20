import { Suspense } from 'react'
import type { Metadata } from 'next'
import { Skeleton } from '@/components/ui/skeleton'
import LaunchRedirector from '@/features/offline/components/LaunchRedirector'

export const metadata: Metadata = {
  title: 'Launch',
  description: 'Restore the most relevant letsboulder route for this device.',
  robots: {
    index: false,
    follow: false,
  },
}

export default function LaunchPage() {
  return (
    <Suspense fallback={<LaunchPageFallback />}>
      <LaunchRedirector />
    </Suspense>
  )
}

function LaunchPageFallback() {
  return (
    <div className="fixed inset-0 overflow-hidden">
      <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.12),_transparent_32%),linear-gradient(180deg,_#f8fafc_0%,_#eef2f7_100%)] px-4 py-10 text-gray-900 dark:bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.15),_transparent_28%),linear-gradient(180deg,_#020617_0%,_#111827_100%)] dark:text-gray-100">
        <div className="mx-auto max-w-xl rounded-3xl border border-white/70 bg-white/90 p-6 shadow-xl shadow-emerald-950/5 backdrop-blur dark:border-white/10 dark:bg-gray-950/80 dark:shadow-black/30">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-700 dark:text-emerald-300">Launch</p>
          <Skeleton className="mt-3 h-9 w-64" />
          <p className="mt-3 text-sm text-gray-600 dark:text-gray-300">Restoring the most relevant route for this device...</p>
        </div>
      </div>
    </div>
  )
}
