import { Suspense } from 'react'
import type { Metadata } from 'next'

import OfflineCragViewer from '@/features/offline/components/OfflineCragViewer'

export const metadata: Metadata = {
  title: 'Saved crag',
  description: 'A crag guide saved on this device.',
  robots: { index: false, follow: false },
}

export default function OfflineCragPage() {
  return (
    <Suspense fallback={<main id="main-content" className="min-h-screen bg-stone-100 p-8 dark:bg-gray-950">Reading saved crag...</main>}>
      <OfflineCragViewer />
    </Suspense>
  )
}
