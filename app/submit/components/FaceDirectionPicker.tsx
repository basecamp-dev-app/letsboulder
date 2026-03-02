'use client'

import { useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
import Image from 'next/image'
import 'leaflet/dist/leaflet.css'
import { FACE_DIRECTIONS } from '@/lib/submission-types'
import type { FaceDirection, FaceDirectionsByImage, GpsData, NewUploadedImage } from '@/lib/submission-types'
import { Skeleton } from '@/components/ui/skeleton'

const MapContainer = dynamic(() => import('react-leaflet').then(mod => mod.MapContainer), { ssr: false })
const TileLayer = dynamic(() => import('react-leaflet').then(mod => mod.TileLayer), { ssr: false })
const Marker = dynamic(() => import('react-leaflet').then(mod => mod.Marker), { ssr: false })

interface FaceDirectionPickerProps {
  gps: GpsData | null
  images: NewUploadedImage[]
  activeImageIndex: number
  initialFaceDirectionsByImage?: FaceDirectionsByImage
  onConfirm: (faceDirectionsByImage: FaceDirectionsByImage) => void
}

const FACE_DIRECTION_DEGREES: Record<FaceDirection, number> = {
  N: 0,
  NE: 45,
  E: 90,
  SE: 135,
  S: 180,
  SW: 225,
  W: 270,
  NW: 315,
}

export default function FaceDirectionPicker({ gps, images, activeImageIndex, initialFaceDirectionsByImage = {}, onConfirm }: FaceDirectionPickerProps) {
  const [orientationsByImage, setOrientationsByImage] = useState<FaceDirectionsByImage>(() => initialFaceDirectionsByImage)
  const [currentImageIndex, setCurrentImageIndex] = useState(() => Math.max(0, activeImageIndex))
  const [isClient, setIsClient] = useState(false)
  const [leaflet, setLeaflet] = useState<typeof import('leaflet') | null>(null)

  const hasBatchImages = images.length > 0
  const maxImageIndex = hasBatchImages ? images.length - 1 : 0
  const clampedCurrentImageIndex = Math.min(Math.max(currentImageIndex, 0), maxImageIndex)
  const currentFaceDirections = orientationsByImage[clampedCurrentImageIndex] || []

  useEffect(() => {
    setIsClient(true)
  }, [])

  useEffect(() => {
    import('leaflet').then(Lib => {
      setLeaflet(Lib)
    })
  }, [])

  useEffect(() => {
    const clampedActiveIndex = Math.min(Math.max(activeImageIndex, 0), maxImageIndex)
    setCurrentImageIndex(clampedActiveIndex)
    setOrientationsByImage(initialFaceDirectionsByImage)
  }, [activeImageIndex, initialFaceDirectionsByImage, maxImageIndex])

  const handleConfirm = () => {
    const normalizedByImage: FaceDirectionsByImage = {}

    for (const [rawIndex, directions] of Object.entries(orientationsByImage)) {
      const index = Number(rawIndex)
      if (!Number.isInteger(index) || index < 0 || index > maxImageIndex) continue
      const uniqueDirections = FACE_DIRECTIONS.filter((direction) => (directions || []).includes(direction))
      if (uniqueDirections.length > 0) {
        normalizedByImage[index] = uniqueDirections
      }
    }

    if (Object.keys(normalizedByImage).length === 0) return
    onConfirm(normalizedByImage)
  }

  const completedImageCount = hasBatchImages
    ? images.filter((_, index) => (orientationsByImage[index] || []).length > 0).length
    : currentFaceDirections.length > 0 ? 1 : 0
  const canConfirm = hasBatchImages
    ? completedImageCount === images.length && images.length > 0
    : currentFaceDirections.length > 0

  const handleDirectionToggle = (direction: FaceDirection) => {
    let nextImageIndex: number | null = null

    setOrientationsByImage((prev) => {
      const currentDirections = prev[clampedCurrentImageIndex] || []
      const isSelected = currentDirections.includes(direction)
      const nextDirections = isSelected
        ? currentDirections.filter((selectedDirection) => selectedDirection !== direction)
        : [...currentDirections, direction]

      const nextState = {
        ...prev,
        [clampedCurrentImageIndex]: nextDirections,
      }

      if (!isSelected && nextDirections.length > 0 && hasBatchImages) {
        const candidateIndexes = [
          ...images.map((_, index) => index).slice(clampedCurrentImageIndex + 1),
          ...images.map((_, index) => index).slice(0, clampedCurrentImageIndex),
        ]

        const nextUnorientedImageIndex = candidateIndexes.find((index) => !nextState[index] || nextState[index].length === 0)

        if (typeof nextUnorientedImageIndex === 'number') {
          nextImageIndex = nextUnorientedImageIndex
        }
      }

      return nextState
    })

    if (nextImageIndex !== null) {
      setCurrentImageIndex(nextImageIndex)
    }
  }

  if (!isClient) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full rounded-lg" />
        <div className="grid grid-cols-4 gap-2">
          {Array.from({ length: 8 }).map((_, index) => (
            <Skeleton key={index} className="h-10 w-full rounded-lg" />
          ))}
        </div>
        <Skeleton className="h-10 w-full rounded-lg" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {hasBatchImages && (
        <div className="overflow-x-auto pb-1">
          <div className="flex min-w-max gap-2">
            {images.map((image, index) => {
              const isActive = index === clampedCurrentImageIndex
              const isComplete = (orientationsByImage[index] || []).length > 0

              return (
                <button
                  key={`${image.uploadedPath}-${index}`}
                  type="button"
                  onClick={() => setCurrentImageIndex(index)}
                  className={`relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border transition-transform duration-200 ${
                    isActive
                      ? 'border-2 border-blue-500 scale-[1.05]'
                      : 'border-gray-300 dark:border-gray-600 hover:border-blue-300 dark:hover:border-blue-500'
                  }`}
                  aria-label={`Select image ${index + 1}`}
                >
                  <Image
                    src={image.uploadedUrl}
                    alt={`Submission image ${index + 1}`}
                    fill
                    sizes="64px"
                    unoptimized
                    className="aspect-square object-cover"
                  />
                  {isComplete && (
                    <span className="absolute right-1 top-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-[10px] font-semibold text-white">
                      ✓
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      )}

      <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 bg-white dark:bg-gray-900">
        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Face direction</p>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          Pick the direction the wall faces from your pin.
        </p>
        {hasBatchImages && (
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            {completedImageCount}/{images.length} photos set.
          </p>
        )}
        {currentFaceDirections.length > 0 ? (
          <p className="text-sm text-blue-600 dark:text-blue-400 mt-2">Selected: {currentFaceDirections.join(', ')}</p>
        ) : (
          <p className="text-sm text-amber-600 dark:text-amber-400 mt-2">Choose one or more directions to continue.</p>
        )}
      </div>

      <div className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden bg-gray-100 dark:bg-gray-800 relative h-52">
        {gps ? (
          <MapContainer
            center={[gps.latitude, gps.longitude]}
            zoom={16}
            zoomControl={false}
            dragging={false}
            scrollWheelZoom={false}
            doubleClickZoom={false}
            touchZoom={false}
            keyboard={false}
            attributionControl={false}
            className="z-0"
            style={{ height: '100%', width: '100%' }}
          >
            <TileLayer
              url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
              attribution='Tiles © Esri'
              maxZoom={19}
            />
            {leaflet && (
              <Marker
                position={[gps.latitude, gps.longitude]}
                icon={leaflet.divIcon({
                  className: 'location-marker',
                  iconSize: [16, 16],
                  iconAnchor: [8, 8]
                })}
              />
            )}
          </MapContainer>
        ) : (
          <div className="h-full flex items-center justify-center text-xs text-gray-500 dark:text-gray-400 px-3 text-center">
            Missing location. Go back and place a pin first.
          </div>
        )}

        <div className="absolute top-2 left-2 z-30 bg-black/70 text-white px-2 py-1 rounded text-[11px] font-medium pointer-events-none">
          N ↑
        </div>

        {gps && currentFaceDirections.length > 0 && (
          <div className="absolute inset-0 z-20 pointer-events-none">
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-10 h-10 rounded-full bg-black/50 border border-white/70 flex items-center justify-center text-white text-lg">
                +
              </div>
            </div>
            {currentFaceDirections.map((direction) => (
              <div key={direction} className="absolute inset-0 flex items-center justify-center">
                <div
                  className="text-white text-lg"
                  style={{ transform: `rotate(${FACE_DIRECTION_DEGREES[direction]}deg) translateY(-34px)` }}
                >
                  ↑
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-4 gap-2">
        {FACE_DIRECTIONS.map((direction) => {
          const isSelected = currentFaceDirections.includes(direction)
          return (
            <button
              key={direction}
              type="button"
              onClick={() => handleDirectionToggle(direction)}
              aria-pressed={isSelected}
              className={`py-2 rounded-lg border text-sm font-medium transition-colors ${
                isSelected
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
              }`}
            >
              {direction}
            </button>
          )
        })}
      </div>

      <button
        onClick={handleConfirm}
        disabled={!canConfirm || !gps}
        className="w-full py-2 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
      >
        Confirm Face Directions
      </button>
    </div>
  )
}
