'use client'

import Image from 'next/image'
import LightweightCragMap from '@/components/LightweightCragMap'
import { RouteEditorRail } from '@/features/route-editor/components/RouteEditorRail'
import { UnifiedRouteCanvas } from '@/features/route-editor/components/UnifiedRouteCanvas'

export function ImageFirstHeader(props: {
  cragSlug: string
  activeSectorName: string | null
  activeImageIndex: number
  totalImages: number
  stackIndex: number | null
  stackLength: number | null
}) {
  const { cragSlug, activeSectorName, activeImageIndex, totalImages, stackIndex, stackLength } = props

  return (
    <header className="absolute inset-x-0 top-0 z-10 bg-gradient-to-b from-black/70 to-transparent px-4 py-4">
      <div className="text-sm text-white/80">
        {cragSlug}
        {activeSectorName ? ` / ${activeSectorName}` : ''}
        {' / '}
        Image {activeImageIndex + 1} of {totalImages}
        {stackIndex !== null && stackLength !== null ? ` / Stack ${stackIndex + 1} of ${stackLength}` : ''}
      </div>
    </header>
  )
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
              <div className="relative h-[60vh] w-full">
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
                      onRouteSelect={onRouteSelect}
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
        <RouteEditorRail routes={props.visibleRoutes as never} selectedRouteId={props.activeRouteId} onSelectRoute={props.onRouteSelect} />
      </div>
    </div>
  )
}

export function ImageFirstDeferredSections(props: {
  mapPins: Array<{ id: string; latitude: number; longitude: number; label: string }>
  activeImageId: string | null
  onSelectPin: (imageId: string) => void
  activeClimbId: string | null
}) {
  const { mapPins, activeImageId, onSelectPin, activeClimbId } = props

  return (
    <>
      {mapPins.length > 0 ? (
        <LightweightCragMap
          className="mt-4"
          pins={mapPins}
          activePinId={activeImageId}
          onPinSelect={onSelectPin}
          heightClassName="min-h-[220px]"
        />
      ) : null}
      {!activeClimbId ? (
        <div className="mt-4 rounded-2xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
          <div className="text-xs font-medium uppercase tracking-[0.2em] text-gray-500">Overview</div>
          <p className="mt-2">Select a route line to view details, or keep swiping to explore this area.</p>
        </div>
      ) : null}
    </>
  )
}
