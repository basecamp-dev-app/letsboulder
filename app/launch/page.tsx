import type { Metadata } from 'next'
import LaunchRedirector from '@/features/offline/components/LaunchRedirector'

export const metadata: Metadata = {
  title: 'Launch',
  description: 'Restore the most relevant letsboulder route for this device.',
  robots: {
    index: false,
    follow: false,
  },
}

export default function LaunchPage() {
  return <LaunchRedirector />
}
