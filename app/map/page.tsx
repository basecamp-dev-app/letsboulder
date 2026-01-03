'use client'

import dynamic from 'next/dynamic'

const SatelliteClimbingMap = dynamic(() => import('@/components/SatelliteClimbingMap'), {
  ssr: false,
  loading: () => <div className="h-96 flex items-center justify-center">Loading map...</div>
})

export default function MapPage() {
  return (
    <div className="fixed inset-0">
      <SatelliteClimbingMap />
    </div>
  )
}