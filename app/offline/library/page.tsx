import type { Metadata } from 'next'
import OfflineLibraryClient from '@/app/offline/components/OfflineLibraryClient'

export const metadata: Metadata = {
  title: 'Offline Library',
  description: 'Open saved crag and climb packs stored on this device.',
  robots: {
    index: false,
    follow: false,
  },
}

export default function OfflineLibraryPage() {
  return <OfflineLibraryClient />
}
