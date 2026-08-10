'use client'

import { GripHorizontal, Loader2, Trash2 } from 'lucide-react'
import type { DragEvent } from 'react'
import type { MediaUploadStatus } from '@/features/media-upload/public'

interface WorkstationImage {
  imageId: string
  signedUrl: string
  badgeNumber: number
  isDefault?: boolean
  status?: MediaUploadStatus
  error?: string | null
  progress?: number
  locationMode?: 'shared' | 'custom'
}

interface WorkstationImageStripProps {
  images: WorkstationImage[]
  activeImageId: string | null
  isQuickBarDragOver: boolean
  imageSwitchingDisabled?: boolean
  onSelectImage: (imageId: string) => void
  onReorderImages?: (imageIds: string[]) => void
  onQuickBarDropFiles?: (files: File[]) => void
  onQuickBarDragStateChange: (isDragOver: boolean) => void
  removeAction?: { loading?: boolean; disabled?: boolean; onClick: () => void }
}

function isInternalImageDrag(event: DragEvent<HTMLElement>): boolean {
  return Array.from(event.dataTransfer.types).includes('application/x-letsboulder-image-id')
}

export function WorkstationImageStrip({
  images,
  activeImageId,
  isQuickBarDragOver,
  imageSwitchingDisabled = false,
  onSelectImage,
  onReorderImages,
  onQuickBarDropFiles,
  onQuickBarDragStateChange,
  removeAction,
}: WorkstationImageStripProps) {
  const handleQuickBarDragOver = (event: DragEvent<HTMLElement>) => {
    event.preventDefault()

    if (isInternalImageDrag(event)) {
      event.dataTransfer.dropEffect = 'move'
      onQuickBarDragStateChange(false)
      return
    }

    if (!onQuickBarDropFiles) return
    event.dataTransfer.dropEffect = 'copy'
    onQuickBarDragStateChange(true)
  }

  const handleQuickBarDragEnter = (event: DragEvent<HTMLElement>) => {
    event.preventDefault()
    if (isInternalImageDrag(event)) return
    if (!onQuickBarDropFiles) return
    onQuickBarDragStateChange(true)
  }

  const handleQuickBarDragLeave = (event: DragEvent<HTMLElement>) => {
    if (isInternalImageDrag(event)) return
    if (!onQuickBarDropFiles) return
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return
    onQuickBarDragStateChange(false)
  }

  const handleQuickBarDrop = (event: DragEvent<HTMLElement>) => {
    const sourceImageId = event.dataTransfer.getData('application/x-letsboulder-image-id')
    if (sourceImageId && onReorderImages) {
      event.preventDefault()
      event.stopPropagation()
      onQuickBarDragStateChange(false)
      const target = event.target as HTMLElement | null
      const targetButton = target?.closest('[data-image-id]') as HTMLElement | null
      const targetImageId = targetButton?.dataset.imageId
      if (!targetImageId || targetImageId === sourceImageId) return
      const currentOrder = images.map((image) => image.imageId)
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
    onQuickBarDragStateChange(false)
    const files = Array.from(event.dataTransfer.files).filter((file) => file.type.startsWith('image/') || /\.(heic|heif)$/i.test(file.name))
    if (files.length === 0) return
    onQuickBarDropFiles(files)
  }

  return (
    <div
      className={`overflow-x-auto rounded-3xl px-3 py-3 shadow-sm transition-colors ${
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
          {images.map((image) => {
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
                onDragEnd={() => {
                  if (onReorderImages) onQuickBarDragStateChange(false)
                }}
                onClick={() => {
                  if (imageSwitchingDisabled) return
                  onSelectImage(image.imageId)
                }}
                disabled={imageSwitchingDisabled}
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
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={image.signedUrl} alt={`Quick switch image ${image.badgeNumber}`} className="h-full w-full object-cover" draggable={false} />
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
                              : image.status === 'PROCESSING'
                                ? 'Preparing'
                                : image.status === 'MODERATING'
                                  ? 'Checking'
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
          <div className="ml-auto hidden shrink-0 items-center gap-1 self-stretch pl-1 md:flex">
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
  )
}
