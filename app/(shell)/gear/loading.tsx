import GearSkeleton from '@/components/gear/GearSkeleton'
import { Skeleton } from '@/components/ui/skeleton'

export default function Loading() {
  return (
    <div className="container mx-auto px-4">
      <div className="max-w-7xl mx-auto">
        <div className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg p-2 mb-2">
          <p className="text-xs text-amber-800 dark:text-amber-200">
            Amazon affiliate links - we earn a commission on Amazon purchases at no extra cost to you.
          </p>
        </div>

        <div className="relative mb-2">
          <Skeleton className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 rounded" />
          <Skeleton className="w-full h-10 rounded-lg" />
        </div>

        <div className="mb-2 flex gap-2 overflow-x-auto pb-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-24 rounded-lg" />
          ))}
        </div>

        <div className="grid grid-cols-3 md:grid-cols-3 lg:grid-cols-6 gap-2 md:gap-4">
          {Array.from({ length: 12 }).map((_, i) => (
            <GearSkeleton key={i} />
          ))}
        </div>
      </div>
    </div>
  )
}
