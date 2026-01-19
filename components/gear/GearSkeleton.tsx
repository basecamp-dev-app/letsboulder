'use client'

export default function GearSkeleton() {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden h-full">
      <div className="h-32 md:h-48 bg-gray-200 dark:bg-gray-700 animate-pulse" />
      <div className="p-2 md:p-4 space-y-2">
        <div className="h-3 md:h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4 animate-pulse" />
        <div className="h-2 md:h-3 bg-gray-200 dark:bg-gray-700 rounded w-full animate-pulse" />
        <div className="h-2 md:h-3 bg-gray-200 dark:bg-gray-700 rounded w-2/3 animate-pulse" />
      </div>
    </div>
  )
}
