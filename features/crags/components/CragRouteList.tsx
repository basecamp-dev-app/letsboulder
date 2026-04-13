import React, { type MouseEvent } from 'react'
import { AlertCircle, ChevronRight, RefreshCw } from 'lucide-react'
import Image from 'next/image'
import { formatGradeForDisplay } from '@/lib/grade-display'
import type { GradeSystem } from '@/lib/grades'
import { formatRatingValue, formatRouteTypeLabel } from '@/features/crags/lib/crag-page-domain'
import type { CragRoute, RoutePreview } from '@/features/crags/lib/crag-page-types'

interface CragRouteListProps {
  filteredRoutes: CragRoute[]
  routesLoadState: 'idle' | 'loading' | 'loaded' | 'error'
  highlightedRouteIds: Set<string>
  routePreviewDisplayByClimbId: Record<string, RoutePreview>
  pinNumberByImageId: Map<string, number>
  gradeSystem: GradeSystem
  routesCount: number
  hasActiveRouteFilters: boolean
  onClearRouteFilters: () => void
  onRetryRoutes: () => void
  onPendingRouteNavigation: (event: MouseEvent<HTMLButtonElement>, route: CragRoute) => void
  getRouteDestination: (route: CragRoute) => { href: string; ready: boolean }
}

function LoadingRows() {
  return (
    <div className="divide-y divide-stone-100 dark:divide-gray-800">
      {Array.from({ length: 5 }, (_, index) => (
        <div key={index} className="flex items-center gap-3 px-4 py-3">
          <div className="size-16 shrink-0 animate-pulse rounded-2xl bg-stone-100 dark:bg-gray-800" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex items-center gap-2">
              <div className="h-4 w-32 animate-pulse rounded-full bg-stone-100 dark:bg-gray-800" />
              <div className="h-4 w-14 animate-pulse rounded-full bg-stone-100 dark:bg-gray-800" />
            </div>
            <div className="flex flex-wrap gap-2">
              <div className="h-3 w-16 animate-pulse rounded-full bg-stone-100 dark:bg-gray-800" />
              <div className="h-3 w-20 animate-pulse rounded-full bg-stone-100 dark:bg-gray-800" />
              <div className="h-3 w-18 animate-pulse rounded-full bg-stone-100 dark:bg-gray-800" />
            </div>
          </div>
          <div className="h-4 w-4 shrink-0 animate-pulse rounded-full bg-stone-100 dark:bg-gray-800" />
        </div>
      ))}
    </div>
  )
}

const CragRouteList = React.memo(function CragRouteList({
  filteredRoutes,
  routesLoadState,
  highlightedRouteIds,
  routePreviewDisplayByClimbId,
  pinNumberByImageId,
  gradeSystem,
  routesCount,
  hasActiveRouteFilters,
  onClearRouteFilters,
  onRetryRoutes,
  onPendingRouteNavigation,
  getRouteDestination,
}: CragRouteListProps) {
  const resultSummary = filteredRoutes.length === routesCount || !hasActiveRouteFilters
    ? `${filteredRoutes.length} routes`
    : `${filteredRoutes.length} of ${routesCount} routes`

  return (
    <div className="overflow-hidden rounded-[28px] border border-stone-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
      <div className="border-b border-stone-100 px-4 py-3 dark:border-gray-800">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500 dark:text-gray-400">
          {routesLoadState === 'loading' ? 'Loading routes' : routesLoadState === 'error' ? 'Route list unavailable' : `Showing ${resultSummary}`}
        </p>
      </div>
      {routesLoadState === 'loading' ? (
        <LoadingRows />
      ) : routesLoadState === 'error' ? (
        <div className="px-4 py-5">
          <div className="rounded-3xl border border-stone-200 bg-stone-50 p-4 dark:border-gray-800 dark:bg-gray-950/60">
            <div className="flex items-start gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-white text-stone-600 shadow-sm dark:bg-gray-900 dark:text-gray-300">
                <AlertCircle className="size-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-stone-900 dark:text-gray-100">Routes could not be refreshed right now.</p>
                <p className="mt-1 text-sm text-stone-600 dark:text-gray-300">Map pins, crag details, and existing filters still work. Retry to load the latest route list and route intelligence.</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button type="button" onClick={onRetryRoutes} className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white px-3 py-2 text-sm font-medium text-stone-700 shadow-sm transition hover:bg-stone-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800">
                    <RefreshCw className="size-4" />
                    <span>Retry</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : filteredRoutes.length === 0 ? (
        <div className="px-4 py-5">
          <div className="rounded-3xl border border-dashed border-stone-300 bg-stone-50/80 p-5 dark:border-gray-700 dark:bg-gray-950/40">
            <p className="text-sm font-semibold text-stone-900 dark:text-gray-100">No routes match these filters.</p>
            <p className="mt-1 text-sm text-stone-600 dark:text-gray-300">Try widening the grade range, removing route-type filters, or clearing everything to get back to the full list.</p>
            <div className="mt-3 text-xs font-medium uppercase tracking-[0.18em] text-stone-500 dark:text-gray-400">0 of {routesCount} routes</div>
            {hasActiveRouteFilters ? (
              <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" onClick={onClearRouteFilters} className="rounded-full border border-stone-200 bg-white px-3 py-2 text-sm font-medium text-stone-700 shadow-sm transition hover:bg-stone-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800">
                  Clear filters
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="divide-y divide-stone-100 dark:divide-gray-800">
          {filteredRoutes.map((route) => {
            const destination = getRouteDestination(route)
            const className = `flex items-center gap-3 px-4 py-3 transition hover:bg-stone-50 dark:hover:bg-gray-800/50 ${highlightedRouteIds.has(route.id) ? 'bg-teal-50/80 ring-1 ring-inset ring-teal-200 dark:bg-teal-950/20 dark:ring-teal-900' : ''}`
            const preview = routePreviewDisplayByClimbId[route.id]

            const content = (
              <>
                {preview ? (
                  <div className="relative size-16 shrink-0 overflow-hidden rounded-2xl border border-stone-200 bg-stone-100 shadow-sm dark:border-gray-700 dark:bg-gray-800">
                    <Image src={preview.imageUrl} alt={`${route.name} topo preview`} fill className="object-cover" sizes="64px" loading="lazy" />
                    {pinNumberByImageId.get(preview.imageId) ? (
                      <div className="absolute left-1.5 top-1.5 flex size-5 items-center justify-center rounded-full bg-white/95 text-[10px] font-semibold text-stone-900 shadow-sm dark:bg-gray-900/95 dark:text-gray-100">
                        {pinNumberByImageId.get(preview.imageId)}
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="flex size-16 shrink-0 items-center justify-center rounded-2xl border border-dashed border-stone-300 bg-stone-50 text-[10px] font-medium uppercase tracking-wide text-stone-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400">No topo</div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    <span className="truncate text-sm font-semibold text-stone-900 dark:text-gray-100">{route.name}</span>
                    <span className="text-sm font-medium text-stone-600 dark:text-gray-300">{formatGradeForDisplay(route.grade, gradeSystem)}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-stone-600 dark:text-gray-300">
                    <span>{formatRatingValue(route.weightedRating)}{route.ratingCount > 0 ? ` (${route.ratingCount})` : ''}</span>
                    <span>{route.sendCount} ascents</span>
                    {route.routeType ? <span>{formatRouteTypeLabel(route.routeType)}</span> : null}
                  </div>
                </div>
                <ChevronRight className="size-4 shrink-0 text-stone-400" />
              </>
            )

            if (!destination.ready) {
              return (
                <button key={route.id} type="button" onClick={(event) => onPendingRouteNavigation(event, route)} className={`${className} w-full text-left`}>
                  {content}
                </button>
              )
            }

            return (
              <a key={route.id} href={destination.href} className={className}>
                {content}
              </a>
            )
          })}
        </div>
      )}
    </div>
  )
})

export default CragRouteList
