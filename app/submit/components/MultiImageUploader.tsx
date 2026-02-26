'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import imageCompression from 'browser-image-compression'
import NextImage from 'next/image'
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, horizontalListSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { NewImageSelection, NewUploadedImage } from '@/lib/submission-types'
import { createClient } from '@/lib/supabase'

const ROUTE_UPLOADS_BUCKET = 'route-uploads'

interface MultiImageUploaderProps {
  onComplete: (result: NewImageSelection) => void
  onError: (error: string) => void
  onUploading: (uploading: boolean, progress: number, step: string) => void
}

interface SelectedImage {
  id: string
  file: File
  previewUrl: string
  width: number
  height: number
}

interface SortableThumbProps {
  image: SelectedImage
  index: number
  onRemove: (id: string) => void
}

function SortableThumb({ image, index, onRemove }: SortableThumbProps) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: image.id })

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className="relative h-24 w-24 shrink-0 overflow-hidden rounded-lg border border-gray-200 bg-gray-100"
    >
      <button
        type="button"
        onClick={() => onRemove(image.id)}
        className="absolute right-1 top-1 z-20 rounded-full bg-black/70 px-1.5 py-0.5 text-xs text-white"
        aria-label="Remove image"
      >
        X
      </button>
      {index === 0 && (
        <div className="absolute left-1 top-1 z-20 rounded bg-blue-600 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-white">
          Primary
        </div>
      )}
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="absolute inset-0 z-10 cursor-grab active:cursor-grabbing"
        aria-label="Drag to reorder"
      />
      <NextImage src={image.previewUrl} alt="Selected" fill unoptimized sizes="96px" className="object-cover" />
    </div>
  )
}

export default function MultiImageUploader({ onComplete, onError, onUploading }: MultiImageUploaderProps) {
  const [images, setImages] = useState<SelectedImage[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const maxFiles = 8

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))
  const canUpload = useMemo(() => images.length > 0, [images.length])

  useEffect(() => {
    return () => {
      for (const image of images) {
        URL.revokeObjectURL(image.previewUrl)
      }
    }
  }, [images])

  const getDimensions = useCallback(async (url: string): Promise<{ width: number; height: number }> => {
    return new Promise((resolve) => {
      const img = new window.Image()
      img.onload = () => resolve({ width: img.naturalWidth || 0, height: img.naturalHeight || 0 })
      img.onerror = () => resolve({ width: 0, height: 0 })
      img.src = url
    })
  }, [])

  const addFiles = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return

    const remaining = Math.max(0, maxFiles - images.length)
    const incoming = Array.from(files).slice(0, remaining)
    if (incoming.length === 0) return

    onUploading(true, 5, 'Preparing photos...')

    const processed: SelectedImage[] = []
    for (const file of incoming) {
      if (!file.type.startsWith('image/')) continue

      const compressed = await imageCompression(file, {
        maxSizeMB: 0.8,
        maxWidthOrHeight: 1800,
        useWebWorker: true,
        initialQuality: 0.82,
      })

      const previewUrl = URL.createObjectURL(compressed)
      const dimensions = await getDimensions(previewUrl)
      processed.push({
        id: crypto.randomUUID(),
        file: compressed,
        previewUrl,
        width: dimensions.width,
        height: dimensions.height,
      })
    }

    setImages((prev) => [...prev, ...processed])
    onUploading(false, 0, '')
  }, [getDimensions, images.length, onUploading])

  const handleRemove = useCallback((id: string) => {
    setImages((prev) => {
      const target = prev.find((item) => item.id === id)
      if (target) URL.revokeObjectURL(target.previewUrl)
      return prev.filter((item) => item.id !== id)
    })
  }, [])

  const onDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    setImages((prev) => {
      const oldIndex = prev.findIndex((item) => item.id === active.id)
      const newIndex = prev.findIndex((item) => item.id === over.id)
      if (oldIndex < 0 || newIndex < 0) return prev
      return arrayMove(prev, oldIndex, newIndex)
    })
  }, [])

  const uploadAll = useCallback(async () => {
    if (!canUpload) {
      onError('Select at least one image first.')
      return
    }

    onUploading(true, 5, 'Starting upload...')
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        onError('Please log in to upload images')
        onUploading(false, 0, '')
        return
      }

      const uploaded: NewUploadedImage[] = []
      const total = images.length

      for (let i = 0; i < total; i += 1) {
        const image = images[i]
        const safeName = image.file.name.replace(/\s+/g, '-').toLowerCase()
        const path = `${user.id}/${Date.now()}-${crypto.randomUUID()}-${safeName}`

        const pct = 10 + Math.round((i / total) * 70)
        onUploading(true, pct, `Uploading image ${i + 1}/${total}...`)

        const { data, error } = await supabase.storage
          .from(ROUTE_UPLOADS_BUCKET)
          .upload(path, image.file, { upsert: false })

        if (error || !data?.path) {
          throw new Error(error?.message || 'Failed to upload image')
        }

        const { data: signedData, error: signedError } = await supabase.storage
          .from(ROUTE_UPLOADS_BUCKET)
          .createSignedUrl(data.path, 3600)

        if (signedError || !signedData?.signedUrl) {
          throw new Error('Failed to generate preview URL')
        }

        uploaded.push({
          uploadedBucket: ROUTE_UPLOADS_BUCKET,
          uploadedPath: data.path,
          uploadedUrl: signedData.signedUrl,
          gpsData: null,
          captureDate: null,
          width: image.width,
          height: image.height,
          naturalWidth: image.width,
          naturalHeight: image.height,
        })
      }

      onUploading(false, 100, '')
      onComplete({
        mode: 'new',
        images: uploaded,
        primaryIndex: 0,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to upload images'
      onError(message)
      onUploading(false, 0, '')
    }
  }, [canUpload, images, onComplete, onError, onUploading])

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

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="min-h-12 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white"
        >
          Add Photos
        </button>
        <button
          type="button"
          onClick={() => void uploadAll()}
          disabled={!canUpload}
          className="min-h-12 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          Upload Batch
        </button>
      </div>

      {images.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-gray-600 dark:text-gray-400">
            Drag to reorder. The first image is used as the primary drawing canvas.
          </p>
          <div className="overflow-x-auto">
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
              <SortableContext items={images.map((img) => img.id)} strategy={horizontalListSortingStrategy}>
                <div className="flex gap-2 pb-1">
                  {images.map((image, index) => (
                    <SortableThumb key={image.id} image={image} index={index} onRemove={handleRemove} />
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
