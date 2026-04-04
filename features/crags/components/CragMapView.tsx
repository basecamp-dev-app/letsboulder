'use client'

import LightweightCragMap from '@/components/LightweightCragMap'
import type { CragPageCrag } from '@/features/crags/lib/crag-page-types'

interface CragMapViewProps {
  crag: CragPageCrag
  mapPins: Array<{ id: string; latitude: number; longitude: number; label: string }>
  selectedImageId: string | null
  cragCenter: [number, number] | null
  isAdmin: boolean
  isFlagging: boolean
  onPinSelect: (imageId: string) => void
  onFlagCrag: (cragId: string) => void
}

export default function CragMapView({
  crag,
  mapPins,
  selectedImageId,
  cragCenter,
  isAdmin,
  isFlagging,
  onPinSelect,
  onFlagCrag,
}: CragMapViewProps) {
  return (
    <div className="relative z-0 h-[34vh] md:h-[58vh] bg-gray-200 dark:bg-gray-800">
      <LightweightCragMap
        pins={mapPins}
        activePinId={selectedImageId}
        initialCenter={cragCenter}
        onPinSelect={onPinSelect}
      />

      <div className="absolute top-4 left-4 z-[1000] bg-white/90 dark:bg-gray-800/90 rounded-lg px-3 py-2 text-sm font-semibold text-gray-900 dark:text-gray-100 shadow-md backdrop-blur">
        {crag.name}
      </div>

      {isAdmin && (
        <button
          onClick={() => onFlagCrag(crag.id)}
          disabled={isFlagging}
          className="absolute top-4 right-4 z-[1000] px-3 py-2 bg-red-600 text-white text-sm font-semibold rounded-lg shadow-md hover:bg-red-500 disabled:opacity-50 transition-colors"
        >
          {isFlagging ? 'Flagging...' : 'Flag'}
        </button>
      )}
    </div>
  )
}
