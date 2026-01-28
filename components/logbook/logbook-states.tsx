'use client'

import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Mountain, Plus } from 'lucide-react'

interface EmptyLogbookProps {
  onGoToMap?: () => void
}

export function EmptyLogbook({ onGoToMap }: EmptyLogbookProps) {
  return (
    <Card className="m-0 border-x-0 border-t-0 rounded-none">
      <CardContent className="flex flex-col items-center justify-center py-16 px-4">
        <div className="w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-4">
          <Mountain className="w-8 h-8 text-gray-400" />
        </div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
          No climbs logged yet
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 text-center mb-6 max-w-sm">
          Tap a route on the map, select it, then tap Flash/Top/Try to log your ascent.
        </p>
        <Button onClick={onGoToMap} className="gap-2">
          <Plus className="w-4 h-4" />
          Go to Map
        </Button>
      </CardContent>
    </Card>
  )
}

export function LogbookSkeleton({ variant = 'own', showProfile = true, showCharts = true, showRecentLogs = true }: LogbookSkeletonProps) {
  return (
    <div className="space-y-0">
      {showProfile && (
        variant === 'public' ? (
          <Card className="m-0 border-x-0 border-t-0 rounded-none">
            <CardContent className="pt-6">
              <div className="flex flex-col items-center">
                <Skeleton className="w-24 h-24 rounded-full mb-4" />
                <Skeleton className="h-6 w-32 mb-2" />
                <Skeleton className="h-4 w-48 mb-6" />
                <div className="grid grid-cols-4 gap-3 w-full">
                  {[1, 2, 3, 4].map((i) => (
                    <Skeleton key={i} className="h-16 rounded-lg" />
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="m-0 border-x-0 border-t-0 rounded-none py-0 gap-0">
            <CardContent className="px-4 py-4">
              <div className="flex items-center gap-3">
                <Skeleton className="w-10 h-10 rounded-full" />
                <Skeleton className="h-4 w-28" />
              </div>
            </CardContent>
          </Card>
        )
      )}

      {showCharts && (
        <>
          <Card className="m-0 border-x-0 border-t-0 rounded-none py-0 gap-0">
            <CardHeader className="py-2 px-4">
              <div className="flex items-center justify-between gap-3">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-4 w-44" />
              </div>
            </CardHeader>
          </Card>

          <Card className="m-0 border-x-0 border-t-0 rounded-none">
            <CardHeader className="pb-2">
              <Skeleton className="h-6 w-56" />
            </CardHeader>
            <CardContent className="pt-0">
              <Skeleton className="h-56 w-full" />
            </CardContent>
          </Card>

          <Card className="m-0 border-x-0 border-t-0 rounded-none">
            <CardHeader className="pb-2">
              <Skeleton className="h-6 w-44" />
            </CardHeader>
            <CardContent className="pt-0 space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="h-4 w-10" />
                  <Skeleton className="h-6 flex-1" />
                  <Skeleton className="h-4 w-6" />
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="m-0 border-x-0 border-t-0 rounded-none">
            <CardHeader className="pb-2">
              <Skeleton className="h-6 w-56" />
            </CardHeader>
            <CardContent className="pt-0 space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Skeleton className="h-4 w-6" />
                    <div className="space-y-2">
                      <Skeleton className="h-4 w-40" />
                      <Skeleton className="h-3 w-28" />
                    </div>
                  </div>
                  <Skeleton className="h-6 w-12 rounded" />
                </div>
              ))}
            </CardContent>
          </Card>
        </>
      )}

      {showRecentLogs && (
        <Card className="m-0 border-x-0 border-t-0 rounded-none">
          <CardHeader className="pb-2">
            <Skeleton className="h-6 w-32" />
          </CardHeader>
          <CardContent className="pt-0 space-y-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center gap-4">
                <Skeleton className="w-12 h-12 rounded" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-24" />
                </div>
                <Skeleton className="h-6 w-16 rounded-full" />
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

interface LogbookSkeletonProps {
  variant?: 'own' | 'public'
  showProfile?: boolean
  showCharts?: boolean
  showRecentLogs?: boolean
}

interface LogEntrySkeletonProps {
  count?: number
}

export function LogEntrySkeleton({ count = 5 }: LogEntrySkeletonProps) {
  return (
    <Card className="m-0 border-x-0 border-t-0 rounded-none">
      <CardHeader className="pb-2">
        <Skeleton className="h-6 w-32" />
      </CardHeader>
      <CardContent className="pt-0 space-y-4">
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="flex items-center gap-4">
            <Skeleton className="w-12 h-12 rounded" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-24" />
            </div>
            <Skeleton className="h-6 w-16 rounded-full" />
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
