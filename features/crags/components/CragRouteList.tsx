import React, { useEffect, useMemo, useRef, useState } from 'react'
import { AlertCircle, ChevronRight, RefreshCw } from 'lucide-react'
import Image from 'next/image'
import { formatGradeForDisplay } from '@/lib/grade-display'
import type { GradeSystem } from '@/lib/grades'
import { formatRatingValue, formatRouteTypeLabel } from '@/features/crags/lib/crag-page-domain'
import type { CragRoute, RoutePreview } from '@/features/crags/lib/crag-page-types'
import { buildThumbnailUrl } from '@/lib/media/thumbnail-url'

interface CragRouteListProps {
  filteredRoutes: CragRoute[]
  routesLoadState: 'idle' | 'loading' | 'loaded' | 'error'
  highlightedRouteIds: Set<string>
  routePreviewDisplayByClimbId: Record<string, RoutePreview>
  routeTargetsHydrating: boolean
  routeTargetsComplete: boolean
  pinNumberByImageId: Map<string, number>
  gradeSystem: GradeSystem
  routesCount: number
  hasActiveRouteFilters: boolean
  onClearRouteFilters: () => void
  onRetryRoutes: () => void
  getRouteDestination: (route: CragRoute) => { href: string; ready: boolean }
}

function useNearViewport(rootMargin = '300px 0px 500px 0px') {
  const elementRef = useRef<HTMLDivElement | null>(null)
  const [isNearViewport, setIsNearViewport] = useState(() => typeof IntersectionObserver === 'undefined')

  useEffect(() => {
    const element = elementRef.current
    if (!element || typeof IntersectionObserver === 'undefined') return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return
        if (!entry.isIntersecting && entry.intersectionRatio <= 0) return
        setIsNearViewport(true)
        observer.disconnect()
      },
      { rootMargin, threshold: 0.01 }
    )

    observer.observe(element)

    return () => {
      observer.disconnect()
    }
  }, [rootMargin])

  return { elementRef, isNearViewport }
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
  routeTargetsHydrating,
  routeTargetsComplete,
  pinNumberByImageId,
  gradeSystem,
  routesCount,
  hasActiveRouteFilters,
  onClearRouteFilters,
  onRetryRoutes,
  getRouteDestination,
}: CragRouteListProps) {
  const resultSummary = filteredRoutes.length === routesCount || !hasActiveRouteFilters
    ? `${filteredRoutes.length} routes`
    : `${filteredRoutes.length} of ${routesCount} routes`
  const previewCount = useMemo(() => {
    return filteredRoutes.reduce((count, route) => count + (routePreviewDisplayByClimbId[route.id] ? 1 : 0), 0)
  }, [filteredRoutes, routePreviewDisplayByClimbId])

  useEffect(() => {
    // eslint-disable-next-line no-console
    console.log('CRAG_DEBUG', {
      stage: 'crag_route_list:render',
      routesLoadState,
      filteredRoutesCount: filteredRoutes.length,
      routesCount,
      previewCount,
      highlightedRouteCount: highlightedRouteIds.size,
      routeTargetsHydrating,
      routeTargetsComplete,
      hasActiveRouteFilters,
    })
  }, [
    filteredRoutes.length,
    hasActiveRouteFilters,
    highlightedRouteIds.size,
    previewCount,
    routeTargetsComplete,
    routeTargetsHydrating,
    routesCount,
    routesLoadState,
  ])

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
        <div role="list" aria-label="Crag routes" className="divide-y divide-stone-100 dark:divide-gray-800">
          {filteredRoutes.map((route, index) => {
            const destination = getRouteDestination(route)
            const className = `flex items-center gap-3 px-4 py-3 transition hover:bg-stone-50 dark:hover:bg-gray-800/50 ${highlightedRouteIds.has(route.id) ? 'bg-teal-50/80 ring-1 ring-inset ring-teal-200 dark:bg-teal-950/20 dark:ring-teal-900' : ''}`
            const preview = routePreviewDisplayByClimbId[route.id]
            const showPreviewSkeleton = !preview && routeTargetsHydrating && !routeTargetsComplete

            const content = (
              <>
                {preview ? (
                  <RoutePreviewImage
                    preview={preview}
                    routeName={route.name}
                    pinNumber={pinNumberByImageId.get(preview.imageId) ?? null}
                    prioritize={index < 6}
                  />
                ) : showPreviewSkeleton ? (
                  <div className="size-16 shrink-0 animate-pulse rounded-2xl border border-stone-200 bg-stone-100 shadow-sm dark:border-gray-700 dark:bg-gray-800" aria-hidden="true" />
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

            return (
              <a key={route.id} aria-label={`Open route ${route.name}`} aria-current={highlightedRouteIds.has(route.id) ? 'page' : undefined} href={destination.href} className={className}>
                {content}
              </a>
            )
          })}
        </div>
      )}
    </div>
  )
})

function RoutePreviewImage({
  preview,
  routeName,
  pinNumber,
  prioritize,
}: {
  preview: RoutePreview
  routeName: string
  pinNumber: number | null
  prioritize: boolean
}) {
  const [loaded, setLoaded] = useState(false)
  const { elementRef, isNearViewport } = useNearViewport()
  const previewUrl = buildThumbnailUrl(preview.imageUrl, 160, 68, {
    storageUrl: preview.storageUrl,
    source: 'api-media',
  })
  const shouldPrioritize = prioritize || isNearViewport

  useEffect(() => {
    // eslint-disable-next-line no-console
    console.log('CRAG_DEBUG', {
      stage: 'crag_route_list:preview_state',
      routeName,
      previewImageId: preview.imageId,
      prioritize,
      isNearViewport,
      shouldPrioritize,
      loaded,
    })
  }, [isNearViewport, loaded, preview.imageId, prioritize, routeName, shouldPrioritize])

  return (
    <div ref={elementRef} className="relative size-16 shrink-0 overflow-hidden rounded-2xl border border-stone-200 bg-stone-100 shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <div className={`absolute inset-0 bg-[linear-gradient(110deg,rgba(255,255,255,0.14),rgba(255,255,255,0.03),rgba(255,255,255,0.14))] transition-opacity duration-300 dark:bg-[linear-gradient(110deg,rgba(255,255,255,0.08),rgba(255,255,255,0.02),rgba(255,255,255,0.08))] ${loaded ? 'opacity-0' : 'animate-pulse opacity-100'}`} />
      <Image
        src={previewUrl}
        alt={`${routeName} topo preview`}
        fill
        className={`object-cover transition duration-500 ${loaded ? 'opacity-100' : 'opacity-0'}`}
        sizes="64px"
        loading={shouldPrioritize ? 'eager' : 'lazy'}
        fetchPriority={shouldPrioritize ? 'high' : 'auto'}
        onLoad={() => {
          // eslint-disable-next-line no-console
          console.log('CRAG_DEBUG', {
            stage: 'crag_route_list:preview_loaded',
            routeName,
            previewImageId: preview.imageId,
            loadingMode: shouldPrioritize ? 'eager' : 'lazy',
            fetchPriority: shouldPrioritize ? 'high' : 'auto',
          })
          setLoaded(true)
        }}
      />
      {pinNumber ? (
        <div className="absolute left-1.5 top-1.5 flex size-5 items-center justify-center rounded-full bg-white/95 text-[10px] font-semibold text-stone-900 shadow-sm dark:bg-gray-900/95 dark:text-gray-100">
          {pinNumber}
        </div>
      ) : null}
    </div>
  )
}

export default CragRouteList
