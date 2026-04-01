'use client'

import LightweightCragMap from '@/components/lightweight-crag-map'
import type { LightweightCragMapPin } from '@/lib/lightweight-crag-map-types'

interface WorkstationMapPanelProps {
  draftPins: LightweightCragMapPin[]
  publishedPins: LightweightCragMapPin[]
  activeImageId: string | null
  initialCenter?: [number, number] | null
  imageSwitchingDisabled?: boolean
  onSelectImage: (imageId: string) => void
}

export function WorkstationMapPanel({
  draftPins,
  publishedPins,
  activeImageId,
  initialCenter,
  imageSwitchingDisabled = false,
  onSelectImage,
}: WorkstationMapPanelProps) {
  return (
    <div className="overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
      <LightweightCragMap
        draftPins={draftPins}
        publishedPins={publishedPins}
        activePinId={activeImageId}
        initialCenter={initialCenter}
        onPinSelect={imageSwitchingDisabled ? undefined : onSelectImage}
        heightClassName="h-[180px] min-h-[180px] md:h-[200px]"
      />
    </div>
  )
}
