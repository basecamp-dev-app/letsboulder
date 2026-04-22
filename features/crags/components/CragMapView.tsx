'use client'

import LightweightCragMap from '@/components/LightweightCragMap'
import type { CragPageCrag } from '@/features/crags/lib/crag-page-types'
import type { LightweightCragMapPin } from '@/lib/lightweight-crag-map-types'

interface CragMapViewProps {
  crag: CragPageCrag
  mapPins: LightweightCragMapPin[]
  selectedImageId: string | null
  cragCenter: [number, number] | null
  isAdmin: boolean
  isFlagging: boolean
  usingCachedFallback: boolean
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
  usingCachedFallback,
  onPinSelect,
  onFlagCrag,
}: CragMapViewProps) {
  if (!cragCenter || mapPins.length === 0) {
    return (
      <div className="relative z-0 h-[clamp(18rem,34dvh,28rem)] bg-gray-200 dark:bg-gray-800 md:h-[58vh] lg:h-[66vh]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.35),_transparent_38%),linear-gradient(180deg,_rgba(229,231,235,0.9),_rgba(209,213,219,0.9))] dark:bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.08),_transparent_34%),linear-gradient(180deg,_rgba(31,41,55,0.92),_rgba(17,24,39,0.96))]" />
        <div className="absolute left-4 top-4 z-[1000] rounded-lg bg-white/90 px-3 py-2 text-sm font-semibold text-gray-900 shadow-md backdrop-blur dark:bg-gray-800/90 dark:text-gray-100">
          {crag.name}
        </div>
        <div className="absolute inset-x-4 bottom-4 z-[1000] max-w-md rounded-2xl border border-white/60 bg-white/90 px-4 py-3 text-sm text-gray-700 shadow-lg backdrop-blur dark:border-white/10 dark:bg-gray-900/85 dark:text-gray-200">
          {usingCachedFallback
            ? 'Map data is not cached on this device yet. Cached routes below are still available.'
            : 'Map data is unavailable right now. Route content below is still available.'}
        </div>
      </div>
    )
  }

  return (
    <div className="relative z-0 h-[clamp(18rem,34dvh,28rem)] bg-gray-200 dark:bg-gray-800 md:h-[58vh] lg:h-[66vh]">
      <LightweightCragMap
        pins={mapPins}
        activePinId={selectedImageId}
        initialCenter={cragCenter}
        onPinSelect={onPinSelect}
        heightMode="fill"
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
