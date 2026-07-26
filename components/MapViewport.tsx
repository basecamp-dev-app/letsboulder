'use client'

import { useEffect, useEffectEvent, useState } from 'react'
import dynamic from 'next/dynamic'
import MapLoadingShell from '@/components/map/MapLoadingShell'
import { useBrowserGeolocation, type BrowserGeolocationStatus } from '@/hooks/use-browser-geolocation'
import { listStoredOfflineMapPins } from '@/lib/offline/storage'
import type { PlacePin } from '@/lib/map/place-pins'
import { cn } from '@/lib/utils'

const InteractiveClimbingMap = dynamic(() => import('@/components/InteractiveClimbingMap'), {
  ssr: false,
  loading: () => null,
})

function MapViewportFallback() {
  return (
    <MapLoadingShell className="absolute inset-0 h-full" />
  )
}

interface MapViewportProps {
  initialPlacePins?: PlacePin[]
  mode?: 'fullscreen' | 'hero'
  className?: string
  showUserLocation?: boolean
  onGeolocationStatusChange?: (status: BrowserGeolocationStatus) => void
}

export default function MapViewport({ initialPlacePins = [], mode = 'fullscreen', className, showUserLocation = false, onGeolocationStatusChange }: MapViewportProps) {
  const [isMapReady, setIsMapReady] = useState(false)
  const [resolvedPlacePins, setResolvedPlacePins] = useState<PlacePin[]>(initialPlacePins)
  const { location: userLocation, status: geolocationStatus } = useBrowserGeolocation(showUserLocation)
  const notifyGeolocationStatusChange = useEffectEvent((status: BrowserGeolocationStatus) => {
    onGeolocationStatusChange?.(status)
  })

  useEffect(() => {
    notifyGeolocationStatusChange(geolocationStatus)
  }, [geolocationStatus])

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
    <div className={cn(
      mode === 'fullscreen'
        ? 'fixed inset-0 overflow-visible'
        : 'relative w-full overflow-hidden rounded-none md:rounded-[2rem]',
      className
    )}>
      {!isMapReady && <MapViewportFallback />}
      <InteractiveClimbingMap initialPlacePins={resolvedPlacePins} onReady={() => setIsMapReady(true)} userLocation={userLocation} />
    </div>
  )
}
