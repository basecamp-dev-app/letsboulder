'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import imageCompression from 'browser-image-compression'
import NextImage from 'next/image'
import { DndContext, MouseSensor, TouchSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, horizontalListSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { convertHeicToJpegBlob } from '@/lib/heic-converter'
import { stripExifMetadataFromFile } from '@/lib/image-metadata'
import { extractGpsFromFile } from '@/lib/image-gps'
import { isHeicFile } from '@/lib/image-utils'
import type { NewImageSelection, NewUploadedImage } from '@/lib/submission-types'
import { createClient } from '@/lib/supabase'

const ROUTE_UPLOADS_BUCKET = 'route-uploads'

interface MultiImageUploaderProps {
  onComplete: (result: NewImageSelection) => void
  onClear: () => void
  onError: (error: string) => void
  onUploading: (uploading: boolean, progress: number, step: string) => void
}

interface SelectedImage extends NewUploadedImage {
  id: string
}

interface SortableThumbProps {
  image: SelectedImage
  index: number
  removing: boolean
  onRemove: (id: string) => void
}

function SortableThumb({ image, index, removing, onRemove }: SortableThumbProps) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: image.id, disabled: removing })

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...attributes}
      {...listeners}
      className="relative h-24 w-24 shrink-0 cursor-grab overflow-hidden rounded-lg border border-gray-200 bg-gray-100 hover:ring-2 hover:ring-blue-500"
    >
      <button
        type="button"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation()
          onRemove(image.id)
        }}
        disabled={removing}
        className="absolute right-1 top-1 z-20 rounded-full bg-black/70 px-1.5 py-0.5 text-xs text-white disabled:opacity-60"
        aria-label="Remove image"
      >
        {removing ? '...' : 'X'}
      </button>
      {index === 0 && (
        <div className="absolute left-1 top-1 z-20 rounded bg-blue-600 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-white">
          Primary
        </div>
      )}
      <NextImage src={image.uploadedUrl} alt="Selected" fill unoptimized sizes="96px" className="object-cover" />
    </div>
  )
}

export default function MultiImageUploader({ onComplete, onClear, onError, onUploading }: MultiImageUploaderProps) {
  const [images, setImages] = useState<SelectedImage[]>([])
  const [isBusy, setIsBusy] = useState(false)
  const [progress, setProgress] = useState(0)
  const [completedCount, setCompletedCount] = useState(0)
  const [totalCount, setTotalCount] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const [removingImageId, setRemovingImageId] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const maxFiles = 8

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 8 } })
  )

  const canAddMore = useMemo(() => images.length < maxFiles, [images.length])

  useEffect(() => {
    if (images.length === 0) {
      onClear()
      return
    }

    onComplete({
      mode: 'new',
      images: images.map((image) => ({
        uploadedBucket: image.uploadedBucket,
        uploadedPath: image.uploadedPath,
        uploadedUrl: image.uploadedUrl,
        gpsData: image.gpsData,
        captureDate: image.captureDate,
        width: image.width,
        height: image.height,
        naturalWidth: image.naturalWidth,
        naturalHeight: image.naturalHeight,
      })),
      primaryIndex: 0,
    })
  }, [images, onClear, onComplete])

  const getDimensions = useCallback(async (url: string): Promise<{ width: number; height: number }> => {
    return new Promise((resolve) => {
      const img = new window.Image()
      img.onload = () => resolve({ width: img.naturalWidth || 0, height: img.naturalHeight || 0 })
      img.onerror = () => resolve({ width: 0, height: 0 })
      img.src = url
    })
  }, [])

  const compressImage = useCallback(async (file: File): Promise<File> => {
    const sourceFile = isHeicFile(file)
      ? new File([
        await convertHeicToJpegBlob(file),
      ], file.name.replace(/\.(heic|heif)$/i, '.jpg'), {
        type: 'image/jpeg',
        lastModified: Date.now(),
      })
      : file

    const compressed = await imageCompression(sourceFile, {
      maxWidthOrHeight: 1600,
      initialQuality: 0.75,
      fileType: 'image/jpeg',
      useWebWorker: true,
    })

    return stripExifMetadataFromFile(compressed)
  }, [])

  const cleanupUploadedFiles = useCallback(async (uploadedFiles: SelectedImage[]) => {
    if (uploadedFiles.length === 0) return

    const supabase = createClient()
    const groupedPaths = new Map<string, string[]>()

    for (const image of uploadedFiles) {
      const paths = groupedPaths.get(image.uploadedBucket) || []
      paths.push(image.uploadedPath)
      groupedPaths.set(image.uploadedBucket, paths)
    }

    for (const [bucket, paths] of groupedPaths.entries()) {
      const uniquePaths = Array.from(new Set(paths))
      const { error } = await supabase.storage.from(bucket).remove(uniquePaths)
      if (error) {
        throw new Error(error.message || 'Failed to clean up uploaded image')
      }
    }
  }, [])

  const addFiles = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0 || isBusy) return

    const remaining = Math.max(0, maxFiles - images.length)
    const incoming = Array.from(files)
      .filter((file) => file.type.startsWith('image/') || isHeicFile(file))
      .slice(0, remaining)

    if (incoming.length === 0) {
      onError('Select at least one image file.')
      return
    }

    setIsBusy(true)
    setCompletedCount(0)
    setTotalCount(incoming.length)
    setProgress(0)
    onUploading(true, 5, incoming.length === 1 ? 'Preparing photo...' : `Preparing ${incoming.length} photos...`)

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setIsBusy(false)
      setCompletedCount(0)
      setTotalCount(0)
      setProgress(0)
      onError('Please log in to upload images')
      onUploading(false, 0, '')
      return
    }

    const uploadedThisBatch: SelectedImage[] = []

    try {
      for (let index = 0; index < incoming.length; index += 1) {
        const file = incoming[index]
        onUploading(true, Math.max(5, Math.round((index / incoming.length) * 90)), `Processing photo ${index + 1}/${incoming.length}...`)

        const [compressed, gpsData] = await Promise.all([
          compressImage(file),
          extractGpsFromFile(file),
        ])

        const ext = compressed.name.split('.').pop() || 'jpg'
        const path = `${user.id}/${Date.now()}-${crypto.randomUUID()}.${ext}`

        onUploading(true, Math.max(10, Math.round(((index + 0.5) / incoming.length) * 90)), `Uploading photo ${index + 1}/${incoming.length}...`)

        const { data, error } = await supabase.storage
          .from(ROUTE_UPLOADS_BUCKET)
          .upload(path, compressed, { upsert: false })

        if (error || !data?.path) {
          throw new Error(error?.message || 'Failed to upload image')
        }

        const { data: signedData, error: signedError } = await supabase.storage
          .from(ROUTE_UPLOADS_BUCKET)
          .createSignedUrl(data.path, 3600)

        if (signedError || !signedData?.signedUrl) {
          throw new Error('Failed to generate preview URL')
        }

        const dimensions = await getDimensions(signedData.signedUrl)
        const uploadedImage: SelectedImage = {
          id: data.path,
          uploadedBucket: ROUTE_UPLOADS_BUCKET,
          uploadedPath: data.path,
          uploadedUrl: signedData.signedUrl,
          gpsData,
          captureDate: null,
          width: dimensions.width,
          height: dimensions.height,
          naturalWidth: dimensions.width,
          naturalHeight: dimensions.height,
        }

        uploadedThisBatch.push(uploadedImage)
        setImages((prev) => [...prev, uploadedImage])
        setCompletedCount(index + 1)
        setProgress(Math.round(((index + 1) / incoming.length) * 100))
      }

      onUploading(false, 100, '')
    } catch (error) {
      setImages((prev) => prev.filter((image) => !uploadedThisBatch.some((uploaded) => uploaded.id === image.id)))
      try {
        await cleanupUploadedFiles(uploadedThisBatch)
      } catch (cleanupError) {
        const cleanupMessage = cleanupError instanceof Error ? cleanupError.message : 'Failed to clean up uploaded images'
        onError(cleanupMessage)
      }

      const message = error instanceof Error ? error.message : 'Failed to upload images'
      onError(message)
      onUploading(false, 0, '')
    } finally {
      setIsBusy(false)
      setCompletedCount(0)
      setTotalCount(0)
      setProgress(0)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }, [cleanupUploadedFiles, compressImage, getDimensions, images.length, isBusy, onError, onUploading])

  const handleRemove = useCallback(async (id: string) => {
    const image = images.find((item) => item.id === id)
    if (!image || removingImageId) return

    setRemovingImageId(id)
    try {
      const supabase = createClient()
      const { error } = await supabase.storage.from(image.uploadedBucket).remove([image.uploadedPath])
      if (error) {
        throw new Error(error.message || 'Failed to remove uploaded image')
      }

      setImages((prev) => prev.filter((item) => item.id !== id))
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Failed to remove uploaded image')
    } finally {
      setRemovingImageId(null)
    }
  }, [images, onError, removingImageId])

  const onDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id || isBusy || removingImageId) return

    setImages((prev) => {
      const oldIndex = prev.findIndex((item) => item.id === active.id)
      const newIndex = prev.findIndex((item) => item.id === over.id)
      if (oldIndex < 0 || newIndex < 0) return prev
      return arrayMove(prev, oldIndex, newIndex)
    })
  }, [isBusy, removingImageId])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    if (!canAddMore || isBusy) return
    setIsDragging(true)
  }, [canAddMore, isBusy])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    void addFiles(e.dataTransfer.files)
  }, [addFiles])

  return (
    <div className="space-y-4">
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*,.heic,.heif,.HEIC,.HEIF"
        className="hidden"
        onChange={(event) => void addFiles(event.target.files)}
      />

      <div
        onClick={() => {
          if (canAddMore && !isBusy) {
            fileInputRef.current?.click()
          }
        }}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`
          relative rounded-lg border-2 border-dashed p-6 text-center transition-all duration-200
          ${canAddMore && !isBusy ? 'cursor-pointer' : 'cursor-default opacity-80'}
          ${isDragging
            ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30'
            : images.length === 0
              ? 'border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500'
              : 'border-gray-200 dark:border-gray-700'
          }
        `}
      >
        {images.length === 0 ? (
          <>
            <svg
              className={`mx-auto h-10 w-10 ${isDragging ? 'text-blue-500' : 'text-gray-400'}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
            <p className="mt-2 text-sm font-medium text-gray-700 dark:text-gray-300">
              {isDragging ? 'Drop photos here' : 'Drop photos or click to select'}
            </p>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Photos upload automatically after selection. JPEG, PNG, HEIC, WebP, up to 8 photos.
            </p>
          </>
        ) : (
          <div className="flex items-center justify-center gap-2 text-sm text-gray-600 dark:text-gray-400">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
            </svg>
            <span>{canAddMore ? 'Add more photos' : 'Photo limit reached'}</span>
          </div>
        )}
      </div>

      {(images.length > 0 || isBusy) && (
        <div className="space-y-2">
          {isBusy ? (
            <div className="rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-xs text-blue-800 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-200">
              Uploading... {completedCount}/{totalCount} ({progress}%)
            </div>
          ) : null}
          <p className="text-xs text-gray-600 dark:text-gray-400">
            Upload multiple photos together when they belong to the same face or the same boulder area.
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            All photos here map to one pin. Use a separate submission for a different face, boulder, or area.
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Drag to reorder. The first image is used as the primary drawing canvas.
          </p>
          <div className="overflow-x-auto">
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
              <SortableContext items={images.map((img) => img.id)} strategy={horizontalListSortingStrategy}>
                <div className="flex gap-2 pb-1">
                  {images.map((image, index) => (
                    <SortableThumb
                      key={image.id}
                      image={image}
                      index={index}
                      removing={removingImageId === image.id}
                      onRemove={(id) => {
                        void handleRemove(id)
                      }}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          </div>
        </div>
      )}
    </div>
  )
}
