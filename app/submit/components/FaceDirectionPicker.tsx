'use client'

import { useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
import 'leaflet/dist/leaflet.css'
import { FACE_DIRECTIONS } from '@/lib/submission-types'
import type { FaceDirection, GpsData } from '@/lib/submission-types'
import { Skeleton } from '@/components/ui/skeleton'

const MapContainer = dynamic(() => import('react-leaflet').then(mod => mod.MapContainer), { ssr: false })
const TileLayer = dynamic(() => import('react-leaflet').then(mod => mod.TileLayer), { ssr: false })
const Marker = dynamic(() => import('react-leaflet').then(mod => mod.Marker), { ssr: false })

interface FaceDirectionPickerProps {
  gps: GpsData | null
  initialFaceDirections?: FaceDirection[]
  onConfirm: (faceDirections: FaceDirection[]) => void
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

export default function FaceDirectionPicker({ gps, initialFaceDirections = [], onConfirm }: FaceDirectionPickerProps) {
  const [faceDirections, setFaceDirections] = useState<FaceDirection[]>(initialFaceDirections)
  const [isClient, setIsClient] = useState(false)
  const [leaflet, setLeaflet] = useState<typeof import('leaflet') | null>(null)

  useEffect(() => {
    setIsClient(true)
  }, [])

  useEffect(() => {
    import('leaflet').then(Lib => {
      setLeaflet(Lib)
    })
  }, [])

  useEffect(() => {
    setFaceDirections(initialFaceDirections)
  }, [initialFaceDirections])

  const handleConfirm = () => {
    if (faceDirections.length === 0) return
    onConfirm(faceDirections)
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
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 bg-white dark:bg-gray-900">
        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Face direction</p>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          Pick the direction the wall faces from your pin.
        </p>
        {faceDirections.length > 0 ? (
          <p className="text-sm text-blue-600 dark:text-blue-400 mt-2">Selected: {faceDirections.join(', ')}</p>
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

        {gps && faceDirections.length > 0 && (
          <div className="absolute inset-0 z-20 pointer-events-none">
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-10 h-10 rounded-full bg-black/50 border border-white/70 flex items-center justify-center text-white text-lg">
                +
              </div>
            </div>
            {faceDirections.map((direction) => (
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
          const isSelected = faceDirections.includes(direction)
          return (
            <button
              key={direction}
              type="button"
              onClick={() => {
                setFaceDirections((prev) => {
                  if (prev.includes(direction)) {
                    return prev.filter((selectedDirection) => selectedDirection !== direction)
                  }

                  return [...prev, direction]
                })
              }}
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
        disabled={faceDirections.length === 0 || !gps}
        className="w-full py-2 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
      >
        Confirm Face Directions
      </button>
    </div>
  )
}
