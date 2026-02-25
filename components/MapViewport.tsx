'use client'

import dynamic from 'next/dynamic'
import { Skeleton } from '@/components/ui/skeleton'

const SatelliteClimbingMap = dynamic(() => import('@/components/SatelliteClimbingMap'), {
  ssr: false,
  loading: () => (
    <div className="h-screen w-full">
      <Skeleton className="h-full w-full bg-gray-100 dark:bg-gray-900" />
    </div>
  ),
})

export default function MapViewport() {
  return (
    <div className="fixed inset-0 overflow-visible pt-[var(--app-header-offset)] md:pt-0">
      <SatelliteClimbingMap />
    </div>
  )
}
