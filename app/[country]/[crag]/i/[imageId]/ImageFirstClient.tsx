'use client'

import Image from 'next/image'
import { useMemo } from 'react'
import { useImageNavigation } from '@/app/[country]/[crag]/i/[imageId]/useImageNavigation'
import type { ImageFirstPayload } from '@/app/[country]/[crag]/i/[imageId]/image-page-server'
import type { RoutePoint } from '@/lib/useRouteSelection'
import ClimbInfoPanel from '@/app/climb/components/ClimbInfoPanel'

function parsePoints(raw: RoutePoint[] | string | null | undefined): RoutePoint[] {
  if (!raw) return []
  if (Array.isArray(raw)) {
    return raw
      .filter((point) => typeof point?.x === 'number' && typeof point?.y === 'number')
      .map((point) => ({ x: point.x, y: point.y }))
  }

  try {
    const parsed = JSON.parse(raw) as RoutePoint[]
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((point) => typeof point?.x === 'number' && typeof point?.y === 'number')
      .map((point) => ({ x: point.x, y: point.y }))
  } catch {
    return []
  }
}

function normalizePoints(
  points: RoutePoint[],
  dims: { width: number; height: number }
): RoutePoint[] {
  if (points.length < 2) return []

  const maxX = Math.max(...points.map((point) => point.x))
  const maxY = Math.max(...points.map((point) => point.y))
  if (maxX <= 1.2 && maxY <= 1.2) {
    return points.map((point) => ({
      x: Math.min(1, Math.max(0, point.x)),
      y: Math.min(1, Math.max(0, point.y)),
    }))
  }

  if (!dims.width || !dims.height) return []

  return points
    .map((point) => ({ x: point.x / dims.width, y: point.y / dims.height }))
    .filter((point) => point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1)
}

function buildSvgPath(points: RoutePoint[]): string {
  if (points.length < 2) return ''
  const [first, ...rest] = points
  return `M ${first?.x ?? 0} ${first?.y ?? 0} ${rest.map((point) => `L ${point.x} ${point.y}`).join(' ')}`
}

export default function ImageFirstClient({ payload }: { payload: ImageFirstPayload }) {
  const {
    heroImage,
    initialRoutes,
    navigationContext,
    initialClimbId,
    initialRouteId,
    countryCode,
    cragSlug,
  } = payload

  const {
    activeImageIndex,
    activeImageId,
    activeRouteId,
    activeClimbId,
    activeSector,
    activeStack,
    emblaRef,
    setActiveImageIndex,
    setUserSelectedRouteId,
    isFirst,
    isLast,
  } = useImageNavigation({
    orderedImageIds: navigationContext.orderedImageIds,
    startIndex: navigationContext.startIndex,
    initialRoutes,
    initialRouteId,
    initialClimbId,
    countryCode,
    cragSlug,
    stacks: navigationContext.stacks,
    sectorMarkers: navigationContext.sectorMarkers,
  })

  const selectedClimb = useMemo(() => {
    const activeRoute = initialRoutes.find((route) => route.routeId === activeRouteId)
    if (!activeRoute) return null
    return {
      id: activeRoute.climbId,
      name: activeRoute.climbName,
      grade: activeRoute.climbGrade || 'Unknown',
      route_type: activeRoute.climbRouteType,
      description: activeRoute.climbDescription,
    }
  }, [activeRouteId, initialRoutes])

  const activeRouteMeta = useMemo(
    () => initialRoutes.find((route) => route.routeId === activeRouteId) || null,
    [activeRouteId, initialRoutes]
  )

  const activeImageMeta = activeImageId ? navigationContext.imageMap[activeImageId] || heroImage : heroImage
  const normalizedRoutes = useMemo(
    () => initialRoutes.map((route) => ({
      ...route,
      svgPath: buildSvgPath(
        normalizePoints(parsePoints(route.pathData), {
          width: activeImageMeta.width,
          height: activeImageMeta.height,
        })
      ),
    })).filter((route) => route.svgPath.length > 0),
    [activeImageMeta.height, activeImageMeta.width, initialRoutes]
  )

  return (
    <div className="flex min-h-screen flex-col bg-black text-white">
      <header className="absolute inset-x-0 top-0 z-10 bg-gradient-to-b from-black/70 to-transparent px-4 py-4">
        <div className="text-sm text-white/80">
          {cragSlug}
          {activeSector ? ` / ${activeSector.name}` : ''}
          {' / '}
          Image {activeImageIndex + 1} of {navigationContext.orderedImageIds.length}
          {activeStack && activeStack.imageIds.length > 1 ? ` / Stack ${activeStack.imageIds.indexOf(activeImageId || '') + 1} of ${activeStack.imageIds.length}` : ''}
        </div>
      </header>

      <main className="relative flex flex-1 items-center justify-center overflow-hidden px-4 py-14">
        <button
          type="button"
          onClick={() => setActiveImageIndex(Math.max(0, activeImageIndex - 1))}
          disabled={isFirst}
          className="absolute left-3 z-10 rounded-full bg-white/15 px-3 py-2 text-sm text-white backdrop-blur disabled:opacity-30"
        >
          Prev
        </button>

        <div className="w-full max-w-6xl overflow-hidden" ref={emblaRef}>
          <div className="flex">
            {navigationContext.orderedImageIds.map((imageId, index) => {
              const imageMeta = navigationContext.imageMap[imageId]
              if (!imageMeta) return null
              const isActive = index === activeImageIndex

              return (
                <div key={imageId} className="relative min-w-0 shrink-0 grow-0 basis-full">
                  <div className="relative h-[60vh] w-full">
                    <Image
                      src={isActive ? heroImage.src : imageMeta.src}
                      alt="Crag viewer"
                      fill
                      priority={isActive ? heroImage.priority : false}
                      className="object-contain"
                      loading={isActive ? 'eager' : 'lazy'}
                      unoptimized
                    />

                    {isActive ? (
                      <svg viewBox="0 0 1 1" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
                        {normalizedRoutes.map((route) => (
                          <path
                            key={route.routeId}
                            d={route.svgPath}
                            stroke={route.color}
                            strokeWidth={route.routeId === activeRouteId ? 0.012 : 0.008}
                            fill="none"
                            vectorEffect="non-scaling-stroke"
                            className="cursor-pointer"
                            onClick={() => setUserSelectedRouteId(route.routeId)}
                          />
                        ))}
                      </svg>
                    ) : null}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <button
          type="button"
          onClick={() => setActiveImageIndex(Math.min(navigationContext.orderedImageIds.length - 1, activeImageIndex + 1))}
          disabled={isLast}
          className="absolute right-3 z-10 rounded-full bg-white/15 px-3 py-2 text-sm text-white backdrop-blur disabled:opacity-30"
        >
          Next
        </button>
      </main>

      <ClimbInfoPanel
        selectedClimb={selectedClimb}
        selectedRouteExists={!!activeRouteId}
        totalRoutesCombined={initialRoutes.length}
        totalFaces={navigationContext.orderedImageIds.length}
        isFacesLoading={false}
        cragPath={`/${countryCode}/${cragSlug}`}
        isOfflineSaved={false}
        offlinePackAvailable={false}
        publicSubmitter={null}
        formattedContributionHandle={null}
        contributionCreditUrl={null}
        imageLatitude={null}
        imageLongitude={null}
        selectedClimbLogged={false}
        selectedClimbLog={null}
        selectedClimbHasSavedFeedback={false}
        selectedClimbFeedbackCollapsed={true}
        selectedClimbRatingSummary={activeRouteMeta ? { rating_avg: activeRouteMeta.climbAverageStars, rating_count: activeRouteMeta.climbStarVotes ?? 0 } : null}
        selectedClimbAverageRating={activeRouteMeta?.climbAverageStars ?? null}
        selectedClimbRoundedStars={Math.round(activeRouteMeta?.climbAverageStars ?? 0)}
        pendingGradeOpinion={null}
        pendingStarRating={null}
        savingFeedback={false}
        logging={false}
        userPresent={false}
        gradeSystem={'font' as never}
        gradeOpinionLabels={{ soft: 'Soft', agree: 'Agree', hard: 'Hard' }}
        formatRouteTypeLabel={(value) => value}
        onOpenOffline={() => undefined}
        onOpenFlag={() => undefined}
        onShare={() => undefined}
        onGoToAuth={() => undefined}
        onLog={() => undefined}
        onSetFeedbackCollapsed={() => undefined}
        onSetPendingGradeOpinion={() => undefined}
        onSetPendingStarRating={() => undefined}
        onSaveFeedback={() => undefined}
        onGoToLogbook={() => undefined}
        deferredSections={
          !activeClimbId ? (
            <div className="mt-4 rounded-2xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
              <div className="text-xs font-medium uppercase tracking-[0.2em] text-gray-500">Overview</div>
              <p className="mt-2">Select a route line to view details, or keep swiping to explore this area.</p>
            </div>
          ) : null
        }
      />
    </div>
  )
}
