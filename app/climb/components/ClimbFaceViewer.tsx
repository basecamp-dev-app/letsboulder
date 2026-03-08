'use client'

import type { MouseEventHandler, RefObject, TouchEventHandler } from 'react'
import Image from 'next/image'
import { ChevronLeft, ChevronRight, Layers } from 'lucide-react'

interface FaceViewerPoint {
  x: number
  y: number
}

interface FaceViewerFace {
  id: string
  url: string
  face_directions: string[] | null
  width?: number | null
  height?: number | null
}

interface FaceViewerPan {
  x: number
  y: number
}

interface ClimbFaceViewerProps {
  visibleFaces: FaceViewerFace[]
  activeFaceIndex: number
  totalFaces: number
  canScrollPrev: boolean
  canScrollNext: boolean
  zoom: number
  minViewerZoom: number
  pan: FaceViewerPan
  canvasFadeOut: boolean
  transitionBufferLoading: boolean
  displayClimbName: string
  viewerReadyState: 'idle' | 'busy'
  activeFaceLoadError: string | null
  activeFaceRetryNonce: number
  displayRouteTapPoint: FaceViewerPoint | null
  emblaRef: (instance: HTMLDivElement | null) => void
  viewerTransformRef: RefObject<HTMLDivElement | null>
  imageRef: RefObject<HTMLImageElement | null>
  canvasRef: RefObject<HTMLCanvasElement | null>
  onTouchStart: TouchEventHandler<HTMLDivElement>
  onTouchMove: TouchEventHandler<HTMLDivElement>
  onTouchEnd: TouchEventHandler<HTMLDivElement>
  onCanvasClick: MouseEventHandler<HTMLCanvasElement>
  onFaceLoad: (faceId: string) => void
  onFaceError: (faceId: string) => void
  onScrollPrev: () => void
  onScrollNext: () => void
  onScrollTo: (index: number) => void
  onPrefetchFace: (face: FaceViewerFace | undefined) => void
  onResetZoomPan: () => void
}

export default function ClimbFaceViewer({
  visibleFaces,
  activeFaceIndex,
  totalFaces,
  canScrollPrev,
  canScrollNext,
  zoom,
  minViewerZoom,
  pan,
  canvasFadeOut,
  transitionBufferLoading,
  displayClimbName,
  viewerReadyState,
  activeFaceLoadError,
  activeFaceRetryNonce,
  displayRouteTapPoint,
  emblaRef,
  viewerTransformRef,
  imageRef,
  canvasRef,
  onTouchStart,
  onTouchMove,
  onTouchEnd,
  onCanvasClick,
  onFaceLoad,
  onFaceError,
  onScrollPrev,
  onScrollNext,
  onScrollTo,
  onPrefetchFace,
  onResetZoomPan,
}: ClimbFaceViewerProps) {
  return (
    <div className="group flex-1 relative overflow-hidden flex items-center justify-center p-4">
      <div className="relative w-full max-w-6xl" ref={emblaRef}>
        <div className="flex">
          {visibleFaces.length === 0 ? (
            <div className="flex w-full items-center justify-center py-16">
              <div className="h-56 w-full max-w-3xl animate-pulse rounded-lg bg-gray-200 dark:bg-gray-800" />
            </div>
          ) : null}

          {visibleFaces.map((face, index) => (
            <div key={face.id} className="relative min-w-0 shrink-0 grow-0 basis-full flex items-center justify-center">
              <div
                ref={index === activeFaceIndex ? viewerTransformRef : undefined}
                className="relative inline-flex max-h-[70vh] max-w-full items-center justify-center overflow-hidden"
                style={index === activeFaceIndex
                  ? {
                      transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})`,
                      transformOrigin: 'center center',
                      touchAction: zoom > minViewerZoom ? 'none' : 'auto',
                    }
                  : undefined}
                onTouchStart={index === activeFaceIndex ? onTouchStart : undefined}
                onTouchMove={index === activeFaceIndex ? onTouchMove : undefined}
                onTouchEnd={index === activeFaceIndex ? onTouchEnd : undefined}
                onTouchCancel={index === activeFaceIndex ? onTouchEnd : undefined}
              >
                <Image
                  key={index === activeFaceIndex ? `${face.id}-${activeFaceRetryNonce}` : face.id}
                  ref={index === activeFaceIndex ? imageRef : undefined}
                  src={face.url}
                  alt={displayClimbName}
                  width={Math.max(1, face.width || 1600)}
                  height={Math.max(1, face.height || 1200)}
                  sizes="100vw"
                  priority={index === activeFaceIndex}
                  unoptimized
                  onLoad={() => onFaceLoad(face.id)}
                  onError={() => onFaceError(face.id)}
                  className={`h-auto max-h-[70vh] w-auto max-w-full object-contain transition-opacity duration-200 ${index === activeFaceIndex ? 'opacity-100' : 'opacity-90'}`}
                />
                {index === activeFaceIndex ? (
                  <canvas
                    ref={canvasRef}
                    className={`absolute inset-0 cursor-pointer transition-opacity duration-150 ${canvasFadeOut || !!activeFaceLoadError ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
                    onClick={onCanvasClick}
                    data-ready-state={viewerReadyState}
                    data-route-target-x={displayRouteTapPoint ? String(displayRouteTapPoint.x) : undefined}
                    data-route-target-y={displayRouteTapPoint ? String(displayRouteTapPoint.y) : undefined}
                    style={{ touchAction: zoom > minViewerZoom ? 'none' : 'auto' }}
                  />
                ) : null}
              </div>
            </div>
          ))}
        </div>

        {totalFaces > 1 ? (
          <>
            <div className="absolute right-2 top-2 z-20 inline-flex items-center gap-1 rounded-full bg-black/40 px-2 py-1 text-xs font-medium text-white backdrop-blur-sm">
              <Layers className="h-3.5 w-3.5" />
              <span>{totalFaces}</span>
            </div>

            {canScrollPrev ? (
              <button
                type="button"
                onClick={onScrollPrev}
                aria-label="Previous face"
                className="absolute left-2 top-1/2 z-20 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/20 text-white opacity-0 backdrop-blur-sm transition hover:bg-white/40 group-hover:opacity-100 md:flex"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
            ) : null}

            {canScrollNext ? (
              <button
                type="button"
                onClick={onScrollNext}
                aria-label="Next face"
                className="absolute right-2 top-1/2 z-20 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/20 text-white opacity-0 backdrop-blur-sm transition hover:bg-white/40 group-hover:opacity-100 md:flex"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            ) : null}

            <div className="absolute bottom-2 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1 rounded-full bg-black/30 px-2 py-1 backdrop-blur-sm">
              {visibleFaces.map((face, idx) => (
                <button
                  key={`dot-${face.id}`}
                  type="button"
                  onClick={() => onScrollTo(idx)}
                  onMouseEnter={() => onPrefetchFace(face)}
                  aria-label={`Go to face ${idx + 1}`}
                  className={`inline-flex h-7 min-w-7 items-center justify-center rounded-full border text-[11px] font-semibold transition ${idx === activeFaceIndex ? 'border-white bg-white text-black' : 'border-white/40 bg-black/35 text-white hover:bg-white/25'}`}
                >
                  {idx + 1}
                </button>
              ))}
              <span className="ml-1 text-[10px] font-medium text-white">{activeFaceIndex + 1}/{visibleFaces.length}</span>
              {visibleFaces[activeFaceIndex]?.face_directions && visibleFaces[activeFaceIndex].face_directions.length > 0 ? (
                <span className="ml-1 flex items-center gap-0.5 text-[10px] font-medium text-white/80">
                  <span className="text-[9px]">SP</span>
                  {visibleFaces[activeFaceIndex].face_directions.join('+')}
                </span>
              ) : null}
            </div>
          </>
        ) : null}

        {zoom > minViewerZoom ? (
          <button
            type="button"
            onClick={onResetZoomPan}
            className="absolute left-2 top-2 z-20 rounded-full bg-black/55 px-3 py-1 text-xs font-medium text-white backdrop-blur-sm transition hover:bg-black/70"
          >
            Reset zoom
          </button>
        ) : null}

        {transitionBufferLoading ? (
          <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center">
            <div className="rounded-full bg-black/55 px-3 py-1.5 text-xs font-medium text-white backdrop-blur-sm">
              Loading face routes...
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
