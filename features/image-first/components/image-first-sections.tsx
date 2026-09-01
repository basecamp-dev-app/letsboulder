'use client'

import Image from 'next/image'
import { RouteEditorRail } from '@/features/route-editor/public'
import { UnifiedRouteCanvas } from '@/features/route-editor/public'

function selectRouteWithoutNavigation(
  routeId: string | null,
  fallback: (routeId: string | null) => void,
) {
  if (typeof window === 'undefined') {
    fallback(routeId)
    return
  }

  try {
    const nextUrl = new URL(window.location.href)
    if (routeId) nextUrl.searchParams.set('route', routeId)
    else nextUrl.searchParams.delete('route')
    nextUrl.searchParams.delete('climb')

    // Next.js integrates native history updates with useSearchParams, so this
    // changes the selected route without starting a server-component navigation.
    window.history.pushState(null, '', `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`)
  } catch {
    fallback(routeId)
  }
}

export function ImageFirstHeader(props: {
  cragSlug: string
  activeSectorName: string | null
  activeImageIndex: number
  totalImages: number
  stackIndex: number | null
  stackLength: number | null
}) {
  void props

  return null
}

export function ImageFirstCanvasCarousel(props: {
  emblaRef: (node: HTMLDivElement | null) => void
  orderedImageIds: string[]
  imageMap: Record<string, { src: string; width: number; height: number }>
  activeImageIndex: number
  activeImageId: string | null
  activeCanvasImageUrl: string
  activeRouteId: string | null
  heroPriority: boolean
  visibleRoutes: unknown[]
  onRouteSelect: (routeId: string | null) => void
}) {
  const { emblaRef, orderedImageIds, imageMap, activeImageIndex, activeImageId, activeCanvasImageUrl, activeRouteId, heroPriority, visibleRoutes, onRouteSelect } = props

  return (
    <div className="w-full max-w-6xl overflow-hidden" ref={emblaRef}>
      <div className="flex">
        {orderedImageIds.map((imageId, index) => {
          const imageMeta = imageMap[imageId]
          if (!imageMeta) return null
          const isActive = index === activeImageIndex

          return (
            <div key={imageId} className="relative min-w-0 shrink-0 grow-0 basis-full">
              <div className="relative h-[58dvh] w-full md:h-[68dvh] lg:h-[72dvh]">
                <Image
                  src={isActive ? activeCanvasImageUrl : imageMeta.src}
                  alt="Crag viewer"
                  fill
                  sizes="(max-width: 1280px) 100vw, 72rem"
                  priority={isActive ? heroPriority : false}
                  className="object-contain"
                  loading={isActive ? 'eager' : 'lazy'}
                />
                {isActive ? (
                  <>
                    <div className="hidden print:block">Canvas URL: {activeCanvasImageUrl}</div>
                    <UnifiedRouteCanvas
                      key={activeImageId}
                      mode="browse"
                      imageUrl={activeCanvasImageUrl}
                      routes={visibleRoutes as never}
                      activeRouteId={activeRouteId}
                      onRouteSelect={(routeId) => selectRouteWithoutNavigation(routeId, onRouteSelect)}
                    />
                  </>
                ) : null}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function ImageFirstFooterRail(props: {
  visibleRoutes: unknown[]
  activeRouteId: string | null
  onRouteSelect: (routeId: string | null) => void
}) {
  return (
    <div className="px-4 pb-4">
      <div className="mx-auto w-full max-w-6xl">
        <RouteEditorRail
          routes={props.visibleRoutes as never}
          selectedRouteId={props.activeRouteId}
          onSelectRoute={(routeId) => selectRouteWithoutNavigation(routeId, props.onRouteSelect)}
        />
      </div>
    </div>
  )
}

export function ImageFirstDeferredSections(props: {
  activeClimbId: string | null
}) {
  const { activeClimbId } = props

  return (
    <>
      {!activeClimbId ? (
        <div className="mt-4 rounded-2xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
          <div className="text-xs font-medium uppercase tracking-[0.2em] text-gray-500">Overview</div>
          <p className="mt-2">Select a route line to view details, or keep swiping to explore this area.</p>
        </div>
      ) : null}
    </>
  )
}
