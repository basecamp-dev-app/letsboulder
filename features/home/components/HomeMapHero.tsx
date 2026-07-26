'use client'

import { useState } from 'react'
import { Crosshair, Loader2 } from 'lucide-react'

import MapViewport from '@/components/MapViewport'
import { Button } from '@/components/ui/button'
import type { BrowserGeolocationStatus } from '@/hooks/use-browser-geolocation'
import { cn } from '@/lib/utils'

interface HomeMapHeroProps {
  className?: string
}

export default function HomeMapHero({ className }: HomeMapHeroProps) {
  const [locateRequested, setLocateRequested] = useState(false)
  const [locationStatus, setLocationStatus] = useState<BrowserGeolocationStatus>('idle')
  const locationUnavailable = locationStatus === 'error' || locationStatus === 'unsupported'
  const handleLocationStatusChange = (status: BrowserGeolocationStatus) => {
    setLocationStatus(status)
    if (status === 'error' || status === 'unsupported') setLocateRequested(false)
  }

  return (
    <div className={cn('relative w-full overflow-hidden rounded-none md:rounded-[2rem]', className)}>
      <h1 className="sr-only">Find rock, gyms, and topos near you.</h1>
      <MapViewport
        mode="hero"
        className="h-full w-full"
        showUserLocation={locateRequested}
        onGeolocationStatusChange={handleLocationStatusChange}
      />
      <Button
        type="button"
        onClick={() => setLocateRequested(true)}
        disabled={locationStatus === 'requesting' || locationStatus === 'success'}
        className="absolute left-4 top-4 z-[1001] rounded-full bg-white/95 text-stone-950 shadow-xl backdrop-blur-md hover:bg-white md:left-6 md:top-6"
      >
        {locationStatus === 'requesting' ? <Loader2 className="animate-spin" /> : <Crosshair />}
        {locationStatus === 'requesting'
          ? 'Finding your location...'
          : locationStatus === 'success'
            ? 'Location found'
            : locationUnavailable
              ? 'Try location again'
              : 'Find climbing near me'}
      </Button>
      {locationUnavailable ? (
        <p role="status" className="absolute left-4 top-16 z-[1001] rounded-full bg-slate-950/80 px-3 py-2 text-xs font-semibold text-white shadow-lg backdrop-blur-md md:left-6 md:top-[4.75rem]">
          Location unavailable. You can still explore the map.
        </p>
      ) : null}
    </div>
  )
}
