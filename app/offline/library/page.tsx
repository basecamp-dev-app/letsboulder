import { Suspense } from 'react'
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
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-50 dark:bg-gray-900" />}>
      <OfflineLibraryClient />
    </Suspense>
  )
}
