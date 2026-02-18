import { Skeleton } from '@/components/ui/skeleton'

export default function CragPageSkeleton() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="relative h-[26vh] md:h-[50vh] bg-gray-200 dark:bg-gray-800">
        <Skeleton className="h-full w-full rounded-none" />
        <Skeleton className="absolute top-4 left-4 h-8 w-40 rounded-lg" />
        <Skeleton className="absolute top-4 right-4 h-9 w-24 rounded-lg" />
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="mb-5 border-b border-gray-200 dark:border-gray-800">
          <div className="flex gap-6 py-3">
            <Skeleton className="h-5 w-20" />
            <Skeleton className="h-5 w-24" />
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, index) => (
            <div key={index} className="rounded-lg overflow-hidden">
              <Skeleton className="h-32 w-full rounded-lg" />
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-2 mt-6 mb-6">
          <Skeleton className="h-7 w-24 rounded-full" />
          <Skeleton className="h-7 w-28 rounded-full" />
          <Skeleton className="h-7 w-24 rounded-full" />
        </div>

        <div className="space-y-4 mb-6">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm">
            <Skeleton className="h-4 w-24 mb-3" />
            <Skeleton className="h-4 w-full mb-2" />
            <Skeleton className="h-4 w-5/6" />
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm">
            <Skeleton className="h-4 w-28 mb-3" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm">
          <Skeleton className="h-4 w-32 mb-4" />
          <div className="space-y-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        </div>
      </div>
    </div>
  )
}
