'use client'

import { useState, type DragEvent } from 'react'
import NextImage from 'next/image'
import { Loader2, Plus, Trash2 } from 'lucide-react'
import LightweightCragMap, { type LightweightCragMapPin } from '@/components/lightweight-crag-map'
import { RouteEditorRail } from '@/components/RouteEditorRail'
import { UnifiedRouteCanvas, type UnifiedRouteCanvasRef } from '@/components/UnifiedRouteCanvas'
import type { GradeSystem } from '@/lib/grades'
import type { RouteLine } from '@/types/domain'

interface WorkstationImage {
  imageId: string
  signedUrl: string
  badgeNumber: number
  isDefault?: boolean
  status?: 'QUEUED' | 'PREPROCESSING' | 'UPLOADING' | 'SUCCESS' | 'FAILED'
  error?: string | null
  progress?: number
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
  existingRouteLines: RouteLine[]
  selectedRouteId: string | null
  gradeSystem: GradeSystem
  onSelectRoute: (routeId: string) => void
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
  existingRouteLines,
  selectedRouteId,
  gradeSystem,
  onSelectRoute,
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
}: SubmissionWorkstationProps) {
  const [isQuickBarDragOver, setIsQuickBarDragOver] = useState(false)

  const activeStatusLabel = activeImageStatus === 'QUEUED'
    ? 'Waiting in queue...'
    : activeImageStatus === 'PREPROCESSING'
      ? 'Compressing and preparing...'
      : activeImageStatus === 'FAILED'
        ? 'Upload failed.'
        : 'Uploading...'

  const handleQuickBarDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (!onQuickBarDropFiles) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
    setIsQuickBarDragOver(true)
  }

  const handleQuickBarDragEnter = (event: DragEvent<HTMLDivElement>) => {
    if (!onQuickBarDropFiles) return
    event.preventDefault()
    setIsQuickBarDragOver(true)
  }

  const handleQuickBarDragLeave = (event: DragEvent<HTMLDivElement>) => {
    if (!onQuickBarDropFiles) return
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return
    setIsQuickBarDragOver(false)
  }

  const handleQuickBarDrop = (event: DragEvent<HTMLDivElement>) => {
    if (!onQuickBarDropFiles) return
    event.preventDefault()
    setIsQuickBarDragOver(false)
    const files = Array.from(event.dataTransfer.files).filter((file) => file.type.startsWith('image/') || /\.(heic|heif)$/i.test(file.name))
    if (files.length === 0) return
    onQuickBarDropFiles(files)
  }

  return (
    <div ref={drawingAreaRef} className="mb-1 space-y-1">
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <LightweightCragMap
          draftPins={draftPins}
          publishedPins={publishedPins}
          activePinId={activeImageId}
          initialCenter={initialCenter}
          onPinSelect={onSelectImage}
          heightClassName="h-[200px] min-h-[200px] md:h-[200px]"
        />
      </div>
      <div
        className={`-mx-1 overflow-x-auto rounded-2xl px-2 py-2 shadow-sm transition-colors ${
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
                onClick={() => onSelectImage(image.imageId)}
                className={`shrink-0 rounded-xl border p-1.5 transition ${
                  isActive
                    ? 'border-blue-600 bg-blue-50 shadow-[0_0_0_1px_rgba(37,99,235,0.25)] dark:bg-blue-950/30'
                    : 'border-gray-200 bg-white hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:hover:bg-gray-800'
                }`}
                aria-pressed={isActive}
                aria-label={`Switch to image ${image.badgeNumber}`}
              >
                <div className="relative h-14 w-14 overflow-hidden rounded-lg border border-gray-200 bg-gray-100 dark:border-gray-700 dark:bg-gray-800">
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
              </button>
            )
          })}
          <div className="ml-auto flex shrink-0 items-center gap-1 self-stretch pl-1">
            {extraAction}
            {addAction ? (
              <button
                type="button"
                onClick={addAction.onClick}
                disabled={addAction.loading || addAction.disabled}
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-60 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                aria-label="Add photos"
              >
                {addAction.loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              </button>
            ) : null}
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
          </div>
        </div>
        </div>
      </div>
      <div className="flex gap-2 rounded-lg bg-gray-100 p-2 dark:bg-gray-800">
        <button
          type="button"
          className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
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
          className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
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
          className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            currentPointsCount > 0
              ? 'bg-orange-500 text-white hover:bg-orange-600'
              : 'cursor-not-allowed bg-gray-200 text-gray-400 dark:bg-gray-600 dark:text-gray-500'
          }`}
          onClick={onUndoPoint}
          disabled={currentPointsCount === 0}
        >
          Undo Point
        </button>
        <button
          type="button"
          className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            currentPointsCount >= 2
              ? 'bg-green-500 text-white hover:bg-green-600'
              : 'cursor-not-allowed bg-gray-200 text-gray-400 dark:bg-gray-600 dark:text-gray-500'
          }`}
          onClick={onFinishRoute}
          disabled={currentPointsCount < 2}
        >
          Finish Route
        </button>
      </div>
      <div className="h-[calc(100dvh-9.75rem)] rounded-t-lg overflow-hidden border border-gray-200 border-b-0 dark:border-gray-800 md:h-[calc(100vh-7.5rem)]">
        {activeImageReady ? (
          <UnifiedRouteCanvas
            ref={routeCanvasRef}
            key={canvasKey}
            mode={canvasMode}
            imageUrl={activeImageUrl}
            routes={existingRouteLines}
            onRoutesUpdate={onRoutesUpdate}
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
        gradeSystem={gradeSystem}
        onSelectRoute={onSelectRoute}
      />
    </div>
  )
}
