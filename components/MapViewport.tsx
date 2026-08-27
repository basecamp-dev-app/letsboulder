'use client'

import { useEffect, useEffectEvent, useState } from 'react'
import dynamic from 'next/dynamic'
import MapLoadingShell from '@/components/map/MapLoadingShell'
import MapUnavailableState from '@/components/map/MapUnavailableState'
import { Button } from '@/components/ui/button'
import { useBrowserGeolocation, type BrowserGeolocationStatus } from '@/hooks/use-browser-geolocation'
import { useMapFailureRecovery } from '@/hooks/use-map-failure-recovery'
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
  onMapAvailabilityChange?: (available: boolean) => void
}

export default function MapViewport({ initialPlacePins = [], mode = 'fullscreen', className, showUserLocation = false, onGeolocationStatusChange, onMapAvailabilityChange }: MapViewportProps) {
  const [isMapReady, setIsMapReady] = useState(false)
  const [resolvedPlacePins, setResolvedPlacePins] = useState<PlacePin[]>(initialPlacePins)
  const { location: userLocation, status: geolocationStatus } = useBrowserGeolocation(showUserLocation)
  const mapRecovery = useMapFailureRecovery(mode === 'hero' ? 'home-map' : 'map-viewport')
  const notifyGeolocationStatusChange = useEffectEvent((status: BrowserGeolocationStatus) => {
    onGeolocationStatusChange?.(status)
  })
  const notifyMapAvailabilityChange = useEffectEvent((available: boolean) => {
    onMapAvailabilityChange?.(available)
  })

  useEffect(() => {
    notifyGeolocationStatusChange(geolocationStatus)
  }, [geolocationStatus])

  useEffect(() => {
    notifyMapAvailabilityChange(!mapRecovery.fatalFailure)
  }, [mapRecovery.fatalFailure])

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
      {mapRecovery.fatalFailure ? (
        <MapUnavailableState
          errorId={mapRecovery.fatalFailure.errorId}
          failureKind={mapRecovery.fatalFailure.kind}
          description={mapRecovery.fatalFailure.kind === 'webgl-unavailable'
            ? 'This browser cannot display the map. Search above, or browse recent crag updates and community activity below.'
            : 'The map could not start. Search and the rest of this page are still available.'}
          recoveryHref={mode === 'hero' ? '#global-search' : '/'}
          recoveryLabel={mode === 'hero' ? 'Search crags and climbs' : 'Browse without the map'}
          onRetry={mapRecovery.retry}
        />
      ) : (
        <>
          {!isMapReady && <MapViewportFallback />}
          <InteractiveClimbingMap
            key={mapRecovery.attempt}
            initialPlacePins={resolvedPlacePins}
            onReady={() => {
              setIsMapReady(true)
              mapRecovery.completeRetry()
            }}
            onMapFailure={mapRecovery.handleFailure}
            focusMapOnReady={mapRecovery.retrying}
            userLocation={userLocation}
          />
          {mapRecovery.resourceFailure ? (
            <div role="status" className="absolute bottom-6 right-4 z-[1001] max-w-sm rounded-2xl border border-amber-300/30 bg-slate-950/90 p-3 text-sm text-white shadow-xl md:right-6">
              <p>Some map resources did not load. Search and page content still work.</p>
              <Button type="button" variant="link" onClick={mapRecovery.retry} className="mt-1 h-auto p-0 text-amber-300">Retry map</Button>
              <span className="sr-only"> Diagnostic ID: {mapRecovery.resourceFailure.errorId}</span>
            </div>
          ) : null}
        </>
      )}
    </div>
  )
}
