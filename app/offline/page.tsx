import type { Metadata } from 'next'
import OfflineDispatcher from '@/features/offline/components/OfflineDispatcher'

export const metadata: Metadata = {
  title: 'Available Locally',
  description: 'Route to live map or content available on this device based on connectivity.',
  robots: {
    index: false,
    follow: false,
  },
}

export default function OfflinePage() {
  return <OfflineDispatcher />
}
