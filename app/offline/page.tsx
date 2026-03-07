import type { Metadata } from 'next'
import OfflineLibraryClient from '@/app/offline/components/OfflineLibraryClient'

export const metadata: Metadata = {
  title: 'Offline Climbs',
  description: 'Open climbs you saved for offline viewing.',
  robots: {
    index: false,
    follow: false,
  },
}

export default function OfflinePage() {
  return <OfflineLibraryClient />
}
