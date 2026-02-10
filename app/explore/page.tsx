import type { Metadata } from 'next'
import CragExplorerClient from '@/app/explore/components/CragExplorerClient'

export const metadata: Metadata = {
  title: 'Explore Problems by Grade',
  description: 'Find crags with the most problems in your grade range. Filter by grade, sort by count, and compare areas quickly.',
  alternates: {
    canonical: '/explore',
  },
}

export default function ExplorePage() {
  return <CragExplorerClient />
}
