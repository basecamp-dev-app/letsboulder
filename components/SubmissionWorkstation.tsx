'use client'

import { useMemo, useState, type DragEvent } from 'react'
import NextImage from 'next/image'
import { GripHorizontal, ImagePlus, Loader2, Plus, Trash2 } from 'lucide-react'
import LightweightCragMap, { type LightweightCragMapPin } from '@/components/lightweight-crag-map'
import { RouteEditorRail } from '@/components/RouteEditorRail'
import { UnifiedRouteCanvas, type UnifiedRouteCanvasRef } from '@/components/UnifiedRouteCanvas'
import type { RouteLine } from '@/types/domain'

interface WorkstationImage {
  imageId: string
  signedUrl: string
  badgeNumber: number
  isDefault?: boolean
  status?: 'QUEUED' | 'PREPROCESSING' | 'UPLOADING' | 'SUCCESS' | 'FAILED'
  error?: string | null
  progress?: number
  locationMode?: 'shared' | 'custom'
}

interface SubmissionWorkstationProps {
  drawingAreaRef: React.RefObject<HTMLDivElement | null>
  routeCanvasRef?: React.RefObject<UnifiedRouteCanvasRef | null>
  quickSwitcherImages: WorkstationImage[]
  activeImageId: string | null
  activeImageUrl: string
  activeImageReady?: boolean
  activeImageStatus?: WorkstationImage['status']
  onRetryActiveImage?: () => void
  onDeleteActiveImage?: () => void
  draftPins?: LightweightCragMapPin[]
  publishedPins?: LightweightCragMapPin[]
  initialCenter?: [number, number] | null
  onSelectImage: (imageId: string) => void
  onReorderImages?: (imageIds: string[]) => void
  existingRouteLines: RouteLine[]
  selectedRouteId: string | null
  onSelectRoute: (routeId: string) => void
  onReorderRoutes?: (routeIds: string[]) => void
  interactionTool: 'select' | 'draw'
  currentPointsCount: number
  onSetSelectTool: () => void
  onSetDrawTool: () => void
  onUndoPoint: () => void
  onFinishRoute: () => void
  canvasKey: string
  extraAction?: React.ReactNode
  addAction?: { loading?: boolean; disabled?: boolean; onClick: () => void }
  removeAction?: { loading?: boolean; disabled?: boolean; onClick: () => void }
  onQuickBarDropFiles?: (files: File[]) => void
  canvasMode?: 'edit-existing'
  onRoutesUpdate: (routes: RouteLine[]) => void
  hideRouteActions?: boolean
}

export function SubmissionWorkstation({
  drawingAreaRef,
  routeCanvasRef,
  quickSwitcherImages,
  activeImageId,
  activeImageUrl,
  activeImageReady = true,
  activeImageStatus,
  onRetryActiveImage,
  onDeleteActiveImage,
  draftPins = [],
  publishedPins = [],
  initialCenter = null,
  onSelectImage,
  onReorderImages,
  existingRouteLines,
  selectedRouteId,
  onSelectRoute,
  onReorderRoutes,
  interactionTool,
  currentPointsCount,
  onSetSelectTool,
  onSetDrawTool,
  onUndoPoint,
  onFinishRoute,
  canvasKey,
  extraAction,
  addAction,
  removeAction,
  onQuickBarDropFiles,
  canvasMode = 'edit-existing',
  onRoutesUpdate,
  hideRouteActions = false,
}: SubmissionWorkstationProps) {
  const [isQuickBarDragOver, setIsQuickBarDragOver] = useState(false)

  const isDrawing = interactionTool === 'draw'
  const hasDraftPoints = currentPointsCount > 0
  const activeImageLabel = useMemo(() => {
    const activeImage = quickSwitcherImages.find((image) => image.imageId === activeImageId)
    if (!activeImage) return 'No active image'
    return activeImage.isDefault ? `Default ${activeImage.badgeNumber}` : `Image ${activeImage.badgeNumber}`
  }, [activeImageId, quickSwitcherImages])
  const routeCountLabel = existingRouteLines.length === 1 ? '1 route' : `${existingRouteLines.length} routes`

  const activeStatusLabel = activeImageStatus === 'QUEUED'
    ? 'Waiting in queue...'
    : activeImageStatus === 'PREPROCESSING'
      ? 'Compressing and preparing...'
      : activeImageStatus === 'FAILED'
        ? 'Upload failed.'
        : 'Uploading...'

  const handleQuickBarDragOver = (event: DragEvent<HTMLElement>) => {
    if (!onQuickBarDropFiles) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
    setIsQuickBarDragOver(true)
  }

  const handleQuickBarDragEnter = (event: DragEvent<HTMLElement>) => {
    if (!onQuickBarDropFiles) return
    event.preventDefault()
    setIsQuickBarDragOver(true)
  }

  const handleQuickBarDragLeave = (event: DragEvent<HTMLElement>) => {
    if (!onQuickBarDropFiles) return
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return
    setIsQuickBarDragOver(false)
  }

  const handleQuickBarDrop = (event: DragEvent<HTMLElement>) => {
    const sourceImageId = event.dataTransfer.getData('application/x-letsboulder-image-id')
    if (sourceImageId && onReorderImages) {
      event.preventDefault()
      setIsQuickBarDragOver(false)
      const target = event.target as HTMLElement | null
      const targetButton = target?.closest('[data-image-id]') as HTMLElement | null
      const targetImageId = targetButton?.dataset.imageId
      if (!targetImageId || targetImageId === sourceImageId) return
      const currentOrder = quickSwitcherImages.map((image) => image.imageId)
      const sourceIndex = currentOrder.indexOf(sourceImageId)
      const targetIndex = currentOrder.indexOf(targetImageId)
      if (sourceIndex < 0 || targetIndex < 0) return
      const nextOrder = [...currentOrder]
      const [moved] = nextOrder.splice(sourceIndex, 1)
      nextOrder.splice(targetIndex, 0, moved)
      onReorderImages(nextOrder)
      return
    }
    if (!onQuickBarDropFiles) return
    event.preventDefault()
    setIsQuickBarDragOver(false)
    const files = Array.from(event.dataTransfer.files).filter((file) => file.type.startsWith('image/') || /\.(heic|heif)$/i.test(file.name))
    if (files.length === 0) return
    onQuickBarDropFiles(files)
  }

  return (
    <div ref={drawingAreaRef} className="mb-1 space-y-3">
      <div className="rounded-3xl border border-gray-200 bg-white/95 p-3 shadow-sm dark:border-gray-800 dark:bg-gray-900/95">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">Route editor</p>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
              <p className="truncate text-base font-semibold text-gray-900 dark:text-gray-100">{activeImageLabel}</p>
              <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300">{routeCountLabel}</span>
              {activeImageStatus && activeImageStatus !== 'SUCCESS' ? (
                <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 dark:bg-blue-950/40 dark:text-blue-200">{activeStatusLabel}</span>
              ) : null}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {extraAction}
            {addAction ? (
              <button
                type="button"
                onClick={addAction.onClick}
                disabled={addAction.loading || addAction.disabled}
                className="inline-flex h-10 items-center gap-2 rounded-2xl border border-gray-300 px-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-60 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
              >
                {addAction.loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
                Add photo
              </button>
            ) : null}
          </div>
        </div>
        <div
          className={`mt-3 overflow-x-auto rounded-3xl px-3 py-3 shadow-sm transition-colors ${
            isQuickBarDragOver
              ? 'border-4 border-dashed border-blue-500 bg-blue-50/50 dark:border-blue-500 dark:bg-blue-950/40'
              : 'border border-gray-200 bg-white/95 dark:border-gray-800 dark:bg-gray-900/95'
          }`}
          onDragEnter={handleQuickBarDragEnter}
          onDragOver={handleQuickBarDragOver}
          onDragLeave={handleQuickBarDragLeave}
          onDrop={handleQuickBarDrop}
        >
          <div className="relative">
            {isQuickBarDragOver ? (
              <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-blue-50/70 text-sm font-semibold text-blue-700 dark:bg-blue-950/50 dark:text-blue-200">
                Drop photos to upload
              </div>
            ) : null}
            <div className="flex items-start gap-2">
              {quickSwitcherImages.map((image) => {
                const isActive = image.imageId === activeImageId
                return (
                  <button
                    key={`quick-switch-${image.imageId}`}
                    type="button"
                    data-image-id={image.imageId}
                    draggable={Boolean(onReorderImages)}
                    onDragStart={(event) => {
                      if (!onReorderImages) return
                      event.dataTransfer.effectAllowed = 'move'
                      event.dataTransfer.setData('application/x-letsboulder-image-id', image.imageId)
                      event.dataTransfer.setData('text/plain', image.imageId)
                    }}
                    onDragOver={(event) => {
                      if (!onReorderImages) return
                      event.preventDefault()
                      event.dataTransfer.dropEffect = 'move'
                    }}
                    onDrop={(event) => handleQuickBarDrop(event)}
                    onClick={() => onSelectImage(image.imageId)}
                    className={`shrink-0 rounded-2xl border p-1.5 transition ${
                      isActive
                        ? 'border-blue-600 bg-blue-50 shadow-[0_0_0_1px_rgba(37,99,235,0.25)] dark:bg-blue-950/30'
                        : 'border-gray-200 bg-white hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:hover:bg-gray-800'
                    }`}
                    aria-pressed={isActive}
                    aria-label={`Switch to image ${image.badgeNumber}`}
                  >
                    <div className="relative h-14 w-14 overflow-hidden rounded-lg border border-gray-200 bg-gray-100 dark:border-gray-700 dark:bg-gray-800">
                      {onReorderImages ? <GripHorizontal className="absolute bottom-1 right-1 z-10 h-3.5 w-3.5 rounded-full bg-black/55 p-[2px] text-white" /> : null}
                      <span className={`absolute left-1 top-1 z-10 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-bold ${isActive ? 'bg-blue-600 text-white' : 'bg-black/70 text-white'}`}>
                        {image.badgeNumber}
                      </span>
                      {image.signedUrl ? (
                        <NextImage src={image.signedUrl} alt={`Quick switch image ${image.badgeNumber}`} fill sizes="56px" className="object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-gray-200 text-[10px] font-medium text-gray-500 dark:bg-gray-700 dark:text-gray-300">
                          {image.status === 'FAILED'
                            ? 'Failed'
                            : image.status === 'QUEUED'
                              ? 'Waiting'
                              : image.status === 'PREPROCESSING'
                                ? 'Preparing'
                                : image.status === 'UPLOADING'
                                  ? `Up ${image.progress || 0}%`
                                  : 'Ready'}
                        </div>
                      )}
                    </div>
                    <div className={`mt-1 text-center text-[11px] font-medium ${isActive ? 'text-blue-700 dark:text-blue-200' : 'text-gray-600 dark:text-gray-300'}`}>
                      {image.isDefault ? `Default ${image.badgeNumber}` : `Image ${image.badgeNumber}`}
                    </div>
                    {image.locationMode ? (
                      <div className="mt-0.5 text-center text-[10px] font-medium uppercase tracking-[0.08em] text-gray-400 dark:text-gray-500">
                        {image.locationMode === 'custom' ? 'Own pin' : 'Shared'}
                      </div>
                    ) : null}
                  </button>
                )
              })}
              <div className="ml-auto flex shrink-0 items-center gap-1 self-stretch pl-1">
                {removeAction ? (
                  <button
                    type="button"
                    onClick={removeAction.onClick}
                    disabled={removeAction.loading || removeAction.disabled}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-red-300 text-red-700 hover:bg-red-50 disabled:opacity-60 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-900/20"
                    aria-label="Delete current image"
                  >
                    {removeAction.loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  </button>
                ) : null}
                {addAction ? (
                  <button
                    type="button"
                    onClick={addAction.onClick}
                    disabled={addAction.loading || addAction.disabled}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-60 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800 md:hidden"
                    aria-label="Add photos"
                  >
                    {addAction.loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-gray-200 bg-white/95 p-2 shadow-sm backdrop-blur dark:border-gray-800 dark:bg-gray-900/95">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <button
            type="button"
            className={`rounded-2xl px-3 py-2 text-sm font-medium transition-colors ${
              interactionTool === 'select'
                ? 'bg-blue-500 text-white'
                : 'bg-white text-gray-700 hover:bg-gray-50 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600'
            }`}
            onClick={onSetSelectTool}
          >
            Select/Edit
          </button>
          <button
            type="button"
            className={`rounded-2xl px-3 py-2 text-sm font-medium transition-colors ${
              interactionTool === 'draw'
                ? 'bg-blue-500 text-white'
                : 'bg-white text-gray-700 hover:bg-gray-50 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600'
            }`}
            onClick={onSetDrawTool}
          >
            Draw Route
          </button>
          <button
            type="button"
            className={`rounded-2xl px-3 py-2 text-sm font-medium transition-colors ${
              currentPointsCount > 0
                ? 'bg-orange-500 text-white hover:bg-orange-600'
                : 'cursor-not-allowed bg-gray-200 text-gray-400 dark:bg-gray-600 dark:text-gray-500'
            }`}
            onClick={onUndoPoint}
            disabled={hideRouteActions || currentPointsCount === 0}
          >
            Undo Point
          </button>
          <button
            type="button"
            className={`rounded-2xl px-3 py-2 text-sm font-medium transition-colors ${
              currentPointsCount >= 2
                ? 'bg-green-500 text-white hover:bg-green-600'
                : 'cursor-not-allowed bg-gray-200 text-gray-400 dark:bg-gray-600 dark:text-gray-500'
            }`}
            onClick={onFinishRoute}
            disabled={hideRouteActions || currentPointsCount < 2}
          >
            Finish Route
          </button>
        </div>
        <div className="mt-2 flex items-center justify-between px-1 text-xs text-gray-500 dark:text-gray-400">
          <span>{isDrawing ? (hasDraftPoints ? `${currentPointsCount} points placed` : 'Tap the wall to add points') : 'Tap a route to edit details'}</span>
          <span>{routeCountLabel}</span>
        </div>
      </div>

      <div className="min-h-[52dvh] overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900 md:min-h-[60dvh]">
        {activeImageReady ? (
          <UnifiedRouteCanvas
            ref={routeCanvasRef}
            key={canvasKey}
            mode={canvasMode}
            imageUrl={activeImageUrl}
            routes={existingRouteLines}
            onRoutesUpdate={onRoutesUpdate}
            className="h-full min-h-[52dvh] md:min-h-[60dvh]"
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 bg-gray-100 px-6 text-center text-sm text-gray-500 dark:bg-gray-900 dark:text-gray-300">
            <div>{activeStatusLabel}</div>
            {activeImageStatus === 'FAILED' ? (
              <div className="flex items-center gap-2">
                {onRetryActiveImage ? (
                  <button
                    type="button"
                    onClick={onRetryActiveImage}
                    className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
                  >
                    Retry
                  </button>
                ) : null}
                {onDeleteActiveImage ? (
                  <button
                    type="button"
                    onClick={onDeleteActiveImage}
                    className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                  >
                    Delete
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        )}
      </div>

      <RouteEditorRail
        routes={existingRouteLines}
        selectedRouteId={selectedRouteId}
        onSelectRoute={onSelectRoute}
        onReorderRoutes={onReorderRoutes}
      />

      <div className="overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <LightweightCragMap
          draftPins={draftPins}
          publishedPins={publishedPins}
          activePinId={activeImageId}
          initialCenter={initialCenter}
          onPinSelect={onSelectImage}
          heightClassName="h-[180px] min-h-[180px] md:h-[200px]"
        />
      </div>
    </div>
  )
}
