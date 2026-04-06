'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import MapLoadingShell from '@/components/map/MapLoadingShell'
import type { PlacePin } from '@/lib/map/place-pins'

const SatelliteClimbingMap = dynamic(() => import('@/components/SatelliteClimbingMap'), {
  ssr: false,
  loading: () => null,
})

function MapViewportFallback() {
  return (
    <MapLoadingShell className="absolute inset-0 h-full" />
  )
}

export default function MapViewport({ initialPlacePins = [] }: { initialPlacePins?: PlacePin[] }) {
  const [isMapReady, setIsMapReady] = useState(false)

  return (
    <div className="fixed inset-0 overflow-visible">
      {!isMapReady && <MapViewportFallback />}
      <SatelliteClimbingMap initialPlacePins={initialPlacePins} onReady={() => setIsMapReady(true)} />
    </div>
  )
}
