'use client'

import React, { type MouseEvent } from 'react'
import { ChevronRight } from 'lucide-react'
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
  onPendingRouteNavigation: (event: MouseEvent<HTMLButtonElement>, route: CragRoute) => void
  getRouteDestination: (route: CragRoute) => { href: string; ready: boolean }
}

const CragRouteList = React.memo(function CragRouteList({
  filteredRoutes,
  routesLoadState,
  highlightedRouteIds,
  routePreviewDisplayByClimbId,
  pinNumberByImageId,
  gradeSystem,
  onPendingRouteNavigation,
  getRouteDestination,
}: CragRouteListProps) {
  return (
    <div className="overflow-hidden rounded-[28px] border border-stone-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
      {routesLoadState === 'loading' ? (
        <div className="px-4 py-6">
          <div className="h-16 animate-pulse rounded-2xl bg-stone-100 dark:bg-gray-800" />
        </div>
      ) : routesLoadState === 'error' ? (
        <p className="px-4 py-4 text-sm text-stone-500 dark:text-gray-400">Route intelligence is unavailable right now.</p>
      ) : filteredRoutes.length === 0 ? (
        <p className="px-4 py-4 text-sm text-stone-500 dark:text-gray-400">No routes match this filter combination.</p>
      ) : (
        <div className="divide-y divide-stone-100 dark:divide-gray-800">
          {filteredRoutes.map((route) => {
            const destination = getRouteDestination(route)
            const className = `flex items-center gap-3 px-4 py-3 transition hover:bg-stone-50 dark:hover:bg-gray-800/50 ${highlightedRouteIds.has(route.id) ? 'bg-teal-50/80 ring-1 ring-inset ring-teal-200 dark:bg-teal-950/20 dark:ring-teal-900' : ''}`

            const content = (
              <>
                {routePreviewDisplayByClimbId[route.id] ? (
                  <div className="relative size-16 shrink-0 overflow-hidden rounded-2xl border border-stone-200 bg-stone-100 shadow-sm dark:border-gray-700 dark:bg-gray-800">
                    <Image src={routePreviewDisplayByClimbId[route.id].imageUrl} alt={`${route.name} topo preview`} fill className="object-cover" sizes="64px" loading="lazy" />
                    {pinNumberByImageId.get(routePreviewDisplayByClimbId[route.id].imageId) ? (
                      <div className="absolute left-1.5 top-1.5 flex size-5 items-center justify-center rounded-full bg-white/95 text-[10px] font-semibold text-stone-900 shadow-sm dark:bg-gray-900/95 dark:text-gray-100">
                        {pinNumberByImageId.get(routePreviewDisplayByClimbId[route.id].imageId)}
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
