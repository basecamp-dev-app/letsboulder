'use client'

import dynamic from 'next/dynamic'

const SatelliteClimbingMap = dynamic(() => import('@/components/SatelliteClimbingMap'), {
  ssr: false,
  loading: () => (
    <div className="fixed inset-0 bg-gray-900 flex items-center justify-center">
      <div className="text-white text-lg">Loading map...</div>
    </div>
  )
})

export default function MapPage() {
  return (
    <div className="fixed inset-0">
      <SatelliteClimbingMap />
    </div>
  )
}