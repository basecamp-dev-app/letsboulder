import dynamic from 'next/dynamic'
import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Interactive Climbing Map',
  description: 'Explore interactive map of climbing routes in Guernsey. Find crags, routes, and plan your next climbing adventure.',
  openGraph: {
    title: 'Interactive Climbing Map - gsyrocks',
    description: 'Explore interactive map of climbing routes in Guernsey. Find crags, routes, and plan your next climbing adventure.',
    url: '/map',
  },
}

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