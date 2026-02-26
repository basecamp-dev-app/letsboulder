'use client'

import { useMemo, useState } from 'react'
import NextImage from 'next/image'
import CragSelector from './CragSelector'
import type { Crag, CragImageSelection } from '@/lib/submission-types'

interface CragImageApiItem {
  id: string
  width: number | null
  height: number | null
  linked_image_id: string | null
  signed_url: string | null
}

interface CragImageCanvasPickerProps {
  onSelect: (selection: CragImageSelection, crag: Crag) => void
}

export default function CragImageCanvasPicker({ onSelect }: CragImageCanvasPickerProps) {
  const [selectedCrag, setSelectedCrag] = useState<Crag | null>(null)
  const [images, setImages] = useState<CragImageApiItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const hasImages = useMemo(() => images.length > 0, [images])

  async function handleCragSelect(crag: Crag) {
    setSelectedCrag(crag)
    setError(null)
    setImages([])
    setLoading(true)

    try {
      const response = await fetch(`/api/crags/${crag.id}/images`)
      const payload = await response.json().catch(() => ({} as { error?: string; images?: CragImageApiItem[] }))

      if (!response.ok) {
        throw new Error(payload.error || 'Failed to load crag images')
      }

      setImages((payload.images || []).filter((item: CragImageApiItem) => typeof item.signed_url === 'string'))
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : 'Failed to load crag images'
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <CragSelector
        onSelect={handleCragSelect}
        latitude={null}
        longitude={null}
        selectedCragId={selectedCrag?.id}
      />

      {loading && <p className="text-sm text-gray-600 dark:text-gray-400">Loading crag images...</p>}

      {error && <p className="text-sm text-red-600">{error}</p>}

      {!loading && selectedCrag && !hasImages && !error && (
        <p className="text-sm text-gray-600 dark:text-gray-400">No uploaded crag images found for this crag yet.</p>
      )}

      {!loading && hasImages && selectedCrag && (
        <div className="space-y-3">
          <p className="text-sm text-gray-600 dark:text-gray-400">Select an image to use as your route drawing canvas.</p>
          <div className="grid grid-cols-2 gap-3">
            {images.map((image) => (
              <button
                key={image.id}
                type="button"
                onClick={() => {
                  onSelect(
                    {
                      mode: 'crag-image',
                      cragImageId: image.id,
                      imageUrl: image.signed_url!,
                      linkedImageId: image.linked_image_id,
                      width: image.width,
                      height: image.height,
                    },
                    selectedCrag
                  )
                }}
                className="overflow-hidden rounded-lg border border-gray-200 bg-white text-left transition hover:border-blue-500"
              >
                <div className="relative h-28 w-full bg-gray-100">
                  <NextImage
                    src={image.signed_url!}
                    alt="Crag image canvas"
                    fill
                    unoptimized
                    className="object-cover"
                    sizes="(max-width: 768px) 50vw, 200px"
                  />
                </div>
                <div className="p-2 text-xs text-gray-600 dark:text-gray-400">
                  {image.width && image.height ? `${image.width} x ${image.height}` : 'Dimensions unknown'}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
