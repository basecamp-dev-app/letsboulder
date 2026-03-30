'use client'

import { useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import MapLoadingShell from '@/components/map/MapLoadingShell'
import { loadPlacePins } from '@/lib/map/load-place-pins'
import type { PlacePin } from '@/lib/map/place-pins'

const SatelliteClimbingMap = dynamic(() => import('@/components/SatelliteClimbingMap'), {
  ssr: false,
  loading: () => <MapLoadingShell />,
})

export default function MapViewport() {
  const mountedRef = useRef(true)
  const [placePins, setPlacePins] = useState<PlacePin[] | null>(null)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  useEffect(() => {
    const abortController = new AbortController()

    void loadPlacePins(abortController.signal).then((pins) => {
      if (!mountedRef.current) return
      setPlacePins(pins)
    })

    return () => {
      abortController.abort()
    }
  }, [])

  return (
    <div className="fixed inset-0 overflow-visible pt-[var(--app-header-offset)] md:pt-0">
      {placePins ? <SatelliteClimbingMap initialPlacePins={placePins} /> : <MapLoadingShell />}
    </div>
  )
}
