'use client'

import dynamic from 'next/dynamic'

const SatelliteClimbingMap = dynamic(() => import('@/components/SatelliteClimbingMap'), {
  ssr: false,
  loading: () => null
})


export default function MapPage() {
  return (
    <div className="absolute inset-0 overflow-visible pt-[5.5rem] md:pt-0">
      <SatelliteClimbingMap />
    </div>
  )
}