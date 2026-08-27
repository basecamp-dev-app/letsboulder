import type { Metadata } from 'next'

import OfflineStatusView from '@/features/offline/components/OfflineStatusView'

export const metadata: Metadata = {
  title: 'Offline',
  description: 'Open climbing guides saved on this device or retry the network.',
  robots: {
    index: false,
    follow: false,
  },
}

export default function OfflinePage() {
  return <OfflineStatusView />
}
