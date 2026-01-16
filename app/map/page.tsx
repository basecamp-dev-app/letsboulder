'use client'

import dynamic from 'next/dynamic'
import { Suspense } from 'react'

const SatelliteClimbingMap = dynamic(() => import('@/components/SatelliteClimbingMap'), {
  ssr: false,
  loading: () => <MapSkeleton />
})

function MapSkeleton() {
  return (
    <div className="absolute inset-0 bg-gray-950">
      <div className="h-full w-full flex flex-col items-center justify-center">
        <div className="relative mb-6">
          <div className="w-16 h-16 border-4 border-gray-700 border-t-blue-500 rounded-full animate-spin" />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-3 h-3 bg-blue-500 rounded-full" />
          </div>
        </div>
        <div className="text-gray-300 text-lg font-medium mb-2">Loading map...</div>
        <div className="text-gray-500 text-sm">Preparing satellite imagery</div>
        <div className="mt-8 flex gap-2">
          <div className="w-2 h-8 bg-gray-800 rounded animate-pulse" style={{ animationDelay: '0ms' }} />
          <div className="w-2 h-8 bg-gray-700 rounded animate-pulse" style={{ animationDelay: '150ms' }} />
          <div className="w-2 h-8 bg-gray-800 rounded animate-pulse" style={{ animationDelay: '300ms' }} />
        </div>
      </div>
    </div>
  )
}

function MapFallback() {
  return <MapSkeleton />
}

export default function MapPage() {
  return (
    <div className="absolute inset-0 overflow-visible">
      <Suspense fallback={<MapFallback />}>
        <SatelliteClimbingMap />
      </Suspense>
    </div>
  )
}