'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import MapLoadingShell from '@/components/map/MapLoadingShell'
import { runWhenIdle } from '@/lib/run-when-idle'

const SatelliteClimbingMap = dynamic(() => import('@/components/SatelliteClimbingMap'), {
  ssr: false,
  loading: () => <MapLoadingShell />,
})

export default function MapViewport() {
  const [shouldLoadMap, setShouldLoadMap] = useState(false)

  useEffect(() => {
    if (shouldLoadMap) return

    let frameId = 0
    let timeoutId = 0
    let cancelIdle: (() => void) | undefined

    frameId = window.requestAnimationFrame(() => {
      cancelIdle = runWhenIdle(() => {
        setShouldLoadMap(true)
      }, 1200)
    })

    timeoutId = window.setTimeout(() => {
      setShouldLoadMap(true)
    }, 2500)

    return () => {
      window.cancelAnimationFrame(frameId)
      cancelIdle?.()
      window.clearTimeout(timeoutId)
    }
  }, [shouldLoadMap])

  const activateMap = () => {
    setShouldLoadMap(true)
  }

  return (
    <div className="fixed inset-0 overflow-visible pt-[var(--app-header-offset)] md:pt-0">
      {shouldLoadMap ? (
        <SatelliteClimbingMap />
      ) : (
        <button
          type="button"
          onClick={activateMap}
          onPointerDown={activateMap}
          onTouchStart={activateMap}
          onFocus={activateMap}
          className="block h-full w-full text-left"
          aria-label="Load interactive climbing map"
        >
          <MapLoadingShell />
        </button>
      )}
    </div>
  )
}
