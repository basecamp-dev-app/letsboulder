import type { Metadata } from 'next'

import OfflineLibraryView from '@/features/offline/components/OfflineLibraryView'

export const metadata: Metadata = {
  title: 'Offline library',
  description: 'Climbing guides saved on this device.',
  robots: { index: false, follow: false },
}

export default function OfflineLibraryPage() {
  return <OfflineLibraryView />
}
