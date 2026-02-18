import { Skeleton } from '@/components/ui/skeleton'

export default function ClimbPageSkeleton() {
  return (
    <div className="min-h-screen bg-white dark:bg-gray-950 flex flex-col">
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-4xl">
          <Skeleton className="h-[55vh] w-full rounded-xl" />
        </div>
      </div>

      <div className="bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 p-4">
        <div className="max-w-md mx-auto">
          <div className="flex items-start justify-between mb-4">
            <div className="w-full">
              <Skeleton className="h-7 w-48 mb-2" />
              <Skeleton className="h-5 w-36 mb-2" />
              <Skeleton className="h-4 w-56" />
            </div>
            <Skeleton className="h-10 w-10 rounded-lg ml-2" />
          </div>

          <div className="space-y-3">
            <Skeleton className="h-4 w-52" />
            <div className="grid grid-cols-3 gap-2">
              <Skeleton className="h-10 w-full rounded-lg" />
              <Skeleton className="h-10 w-full rounded-lg" />
              <Skeleton className="h-10 w-full rounded-lg" />
            </div>
          </div>

          <div className="mt-6 space-y-3">
            <Skeleton className="h-5 w-28" />
            <Skeleton className="h-10 w-full rounded-lg" />
            <Skeleton className="h-10 w-full rounded-lg" />
          </div>
        </div>
      </div>
    </div>
  )
}
