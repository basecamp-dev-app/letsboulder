import { Skeleton } from '@/components/ui/skeleton'

export default function DraftIntakeLoadingShell() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="mx-auto max-w-3xl px-4 py-6">
        <div className="mb-4">
          <Skeleton className="h-5 w-36" />
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
          <Skeleton className="h-6 w-48" />
        </div>

        <div className="mt-4 rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
          <Skeleton className="h-5 w-28" />
          <div className="mt-3 space-y-3">
            <Skeleton className="h-24 w-full rounded-lg" />
            <div className="flex gap-2">
              <Skeleton className="h-9 w-32 rounded-md" />
              <Skeleton className="h-9 w-24 rounded-md" />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
