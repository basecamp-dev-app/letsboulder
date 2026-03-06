'use client'

import dynamic from 'next/dynamic'
import MapLoadingShell from '@/components/map/MapLoadingShell'

const SatelliteClimbingMap = dynamic(() => import('@/components/SatelliteClimbingMap'), {
  ssr: false,
  loading: () => <MapLoadingShell />,
})

export default function MapViewport() {
  return (
    <div className="fixed inset-0 overflow-visible pt-[var(--app-header-offset)] md:pt-0">
      <SatelliteClimbingMap />
    </div>
  )
}
