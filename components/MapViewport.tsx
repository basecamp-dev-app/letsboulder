'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import MapLoadingShell from '@/components/map/MapLoadingShell'
import { listStoredOfflineMapPins } from '@/lib/offline/storage'
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
  const [resolvedPlacePins, setResolvedPlacePins] = useState<PlacePin[]>(initialPlacePins)

  useEffect(() => {
    if (typeof window === 'undefined' || window.navigator.onLine !== false || initialPlacePins.length > 0) {
      return
    }

    void listStoredOfflineMapPins().then((pins) => {
      if (pins.length > 0) {
        setResolvedPlacePins(pins)
      }
    }).catch(() => undefined)
  }, [initialPlacePins])

  return (
    <div className="fixed inset-0 overflow-visible">
      {!isMapReady && <MapViewportFallback />}
      <SatelliteClimbingMap initialPlacePins={resolvedPlacePins} onReady={() => setIsMapReady(true)} />
    </div>
  )
}
