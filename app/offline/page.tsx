import type { Metadata } from 'next'
import OfflineDispatcher from '@/features/offline/components/OfflineDispatcher'

export const metadata: Metadata = {
  title: 'Downloads',
  description: 'Route to live map or saved downloads based on connectivity.',
  robots: {
    index: false,
    follow: false,
  },
}

export default function OfflinePage() {
  return <OfflineDispatcher />
}
