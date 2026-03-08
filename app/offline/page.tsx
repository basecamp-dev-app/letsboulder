import type { Metadata } from 'next'
import OfflineModeChooser from '@/app/offline/components/OfflineModeChooser'

export const metadata: Metadata = {
  title: 'Offline Climbs',
  description: 'Choose between saved offline packs and the live map.',
  robots: {
    index: false,
    follow: false,
  },
}

export default function OfflinePage() {
  return <OfflineModeChooser />
}
