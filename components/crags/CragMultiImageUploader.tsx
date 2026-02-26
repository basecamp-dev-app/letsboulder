'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import imageCompression from 'browser-image-compression'
import { Camera, X } from 'lucide-react'
import Image from 'next/image'
import { csrfFetch } from '@/hooks/useCsrf'

interface CragMultiImageUploaderProps {
  cragId: string
  onUploaded?: () => void
  maxFiles?: number
}

interface PreviewImage {
  id: string
  file: File
  objectUrl: string
}

const DEFAULT_MAX_FILES = 8

export default function CragMultiImageUploader({
  cragId,
  onUploaded,
  maxFiles = DEFAULT_MAX_FILES,
}: CragMultiImageUploaderProps) {
  const [images, setImages] = useState<PreviewImage[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const galleryInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const imagesRef = useRef<PreviewImage[]>([])

  const remainingSlots = Math.max(0, maxFiles - images.length)
  const canUpload = useMemo(() => !isUploading && images.length > 0, [isUploading, images.length])

  useEffect(() => {
    imagesRef.current = images
  }, [images])

  useEffect(() => {
    return () => {
      for (const image of imagesRef.current) {
        URL.revokeObjectURL(image.objectUrl)
      }
    }
  }, [])

  async function compressImage(file: File): Promise<File> {
    return imageCompression(file, {
      maxSizeMB: 0.7,
      maxWidthOrHeight: 1600,
      useWebWorker: true,
      initialQuality: 0.82,
    })
  }

  async function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0 || remainingSlots === 0) return
    setError(null)

    const incoming = Array.from(fileList).slice(0, remainingSlots)
    const processed: PreviewImage[] = []

    for (const file of incoming) {
      if (!file.type.startsWith('image/')) continue

      const compressed = await compressImage(file)
      processed.push({
        id: crypto.randomUUID(),
        file: compressed,
        objectUrl: URL.createObjectURL(compressed),
      })
    }

    if (processed.length > 0) {
      setImages((prev) => [...prev, ...processed])
    }
  }

  function removeImage(imageId: string) {
    setImages((prev) => {
      const match = prev.find((image) => image.id === imageId)
      if (match) URL.revokeObjectURL(match.objectUrl)
      return prev.filter((image) => image.id !== imageId)
    })
  }

  async function uploadImages() {
    if (!canUpload) return

    setIsUploading(true)
    setError(null)

    try {
      const formData = new FormData()
      for (const image of images) {
        formData.append('images', image.file, image.file.name)
      }

      const response = await csrfFetch(`/api/crags/${cragId}/images`, {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        const payload = await response.json().catch(() => ({} as { error?: string }))
        throw new Error(payload.error || 'Upload failed')
      }

      for (const image of images) {
        URL.revokeObjectURL(image.objectUrl)
      }

      setImages([])
      onUploaded?.()
    } catch (uploadError) {
      const message = uploadError instanceof Error ? uploadError.message : 'Upload failed'
      setError(message)
    } finally {
      setIsUploading(false)
    }
  }

  return (
    <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-3">
      <input
        ref={galleryInputRef}
        type="file"
        multiple
        accept="image/*"
        className="hidden"
        onChange={(event) => void handleFiles(event.target.files)}
      />

      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(event) => void handleFiles(event.target.files)}
      />

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => galleryInputRef.current?.click()}
          disabled={remainingSlots === 0 || isUploading}
          className="min-h-12 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          Add Photos
        </button>

        <button
          type="button"
          onClick={() => cameraInputRef.current?.click()}
          disabled={remainingSlots === 0 || isUploading}
          className="flex min-h-12 items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-900 disabled:opacity-50"
        >
          <Camera className="h-4 w-4" />
          Capture
        </button>
      </div>

      <div className="overflow-x-auto">
        <div className="flex min-h-24 gap-2">
          {images.map((image) => (
            <div key={image.id} className="relative h-24 w-24 shrink-0 overflow-hidden rounded-lg border border-gray-200">
              <Image
                src={image.objectUrl}
                alt="Selected image preview"
                fill
                unoptimized
                sizes="96px"
                className="object-cover"
              />
              <button
                type="button"
                onClick={() => removeImage(image.id)}
                className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/70 text-white"
                aria-label="Remove selected image"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <button
        type="button"
        onClick={() => void uploadImages()}
        disabled={!canUpload}
        className="min-h-12 w-full rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
      >
        {isUploading ? 'Uploading...' : `Upload ${images.length} image${images.length === 1 ? '' : 's'}`}
      </button>
    </div>
  )
}
