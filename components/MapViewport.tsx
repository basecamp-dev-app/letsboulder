'use client'

import dynamic from 'next/dynamic'
import type { PlacePin } from '@/lib/map/place-pins'

const SatelliteClimbingMap = dynamic(() => import('@/components/SatelliteClimbingMap'), {
  ssr: false,
})

export default function MapViewport({ initialPlacePins = [] }: { initialPlacePins?: PlacePin[] }) {
  return (
    <div className="fixed inset-0 overflow-visible pt-[var(--app-header-offset)] md:pt-0">
      <SatelliteClimbingMap initialPlacePins={initialPlacePins} />
    </div>
  )
}
