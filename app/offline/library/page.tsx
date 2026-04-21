import { Suspense } from 'react'
import type { Metadata } from 'next'
import { Skeleton } from '@/components/ui/skeleton'
import OfflineLibraryClient from '@/features/offline/components/OfflineLibraryClient'

export const metadata: Metadata = {
  title: 'Available Locally',
  description: 'Open pinned and locally available crag and climb pages stored on this device.',
  robots: {
    index: false,
    follow: false,
  },
}

function OfflineLibraryLoadingFallback() {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.12),_transparent_32%),linear-gradient(180deg,_#f8fafc_0%,_#eef2f7_100%)] px-4 py-10 text-gray-900 dark:bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.15),_transparent_28%),linear-gradient(180deg,_#020617_0%,_#111827_100%)] dark:text-gray-100">
      <div className="mx-auto max-w-5xl">
        <div className="rounded-3xl border border-white/70 bg-white/90 p-6 shadow-xl shadow-emerald-950/5 backdrop-blur dark:border-white/10 dark:bg-gray-950/80 dark:shadow-black/30">
          <div className="mb-4 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">
            <span>Offline</span>
            <span>/</span>
            <span className="text-gray-700 dark:text-gray-200">Available locally</span>
          </div>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-700 dark:text-emerald-300">Offline</p>
              <Skeleton className="mt-3 h-9 w-52" />
              <p className="mt-3 text-sm text-gray-600 dark:text-gray-300">Loading pinned and locally available pages from this device...</p>
              <Skeleton className="mt-3 h-4 w-full max-w-2xl" />
            </div>
            <div className="flex gap-3">
              <Skeleton className="h-10 w-20 rounded-xl" />
              <Skeleton className="h-10 w-28 rounded-xl" />
            </div>
          </div>

          <div className="mt-6 grid gap-3 md:grid-cols-2">
            <div className="rounded-2xl border border-amber-200 bg-amber-50/80 px-4 py-4 dark:border-amber-900/60 dark:bg-amber-950/30">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="mt-3 h-4 w-full" />
              <Skeleton className="mt-2 h-4 w-5/6" />
            </div>
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 px-4 py-4 dark:border-emerald-900/60 dark:bg-emerald-950/30">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="mt-3 h-4 w-full" />
              <Skeleton className="mt-2 h-4 w-4/6" />
            </div>
          </div>

          <section className="mt-8 space-y-4">
            <div>
              <Skeleton className="h-4 w-24" />
              <Skeleton className="mt-2 h-4 w-full max-w-2xl" />
            </div>
            <div className="grid gap-5 lg:grid-cols-2">
              {Array.from({ length: 2 }).map((_, index) => (
                <article key={index} className="overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
                  <Skeleton className="aspect-[16/8] w-full rounded-none" />
                  <div className="space-y-3 p-4">
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                      {Array.from({ length: 3 }).map((__, childIndex) => (
                        <div key={childIndex} className="overflow-hidden rounded-2xl border border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-950">
                          <Skeleton className="aspect-[4/3] w-full rounded-none" />
                          <div className="p-3">
                            <Skeleton className="h-4 w-full" />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

export default function OfflineLibraryPage() {
  return (
    <Suspense fallback={<OfflineLibraryLoadingFallback />}>
      <OfflineLibraryClient />
    </Suspense>
  )
}
