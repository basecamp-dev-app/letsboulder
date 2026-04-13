'use client'

import dynamic from 'next/dynamic'
import { Skeleton } from '@/components/ui/skeleton'

function DraftIntakeLoadingFallback() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="mx-auto max-w-3xl px-4 py-6">
        <Skeleton className="h-5 w-36" />

        <div className="mt-4 rounded-3xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-950">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="mt-3 h-4 w-full max-w-xl" />
          <p className="mt-4 text-sm text-gray-600 dark:text-gray-300">Preparing your draft uploader...</p>

          <div className="mt-6 rounded-3xl border border-dashed border-gray-300 p-6 dark:border-gray-700">
            <Skeleton className="h-28 w-full rounded-2xl" />
            <div className="mt-4 flex gap-3">
              <Skeleton className="h-10 w-32 rounded-xl" />
              <Skeleton className="h-10 w-24 rounded-xl" />
            </div>
          </div>

          <div className="mt-6 grid grid-cols-3 gap-3 sm:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="aspect-square rounded-2xl" />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

const DraftIntakeView = dynamic(
  () => import('@/features/submissions/components/DraftIntakeView'),
  { ssr: false, loading: () => <DraftIntakeLoadingFallback /> }
)

export default function DraftIntakeClient() {
  return <DraftIntakeView />
}
