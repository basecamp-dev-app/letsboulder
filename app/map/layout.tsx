import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Interactive Climbing Map',
  description: 'Explore climbing routes across Guernsey on our interactive map. Find crags, view route images, and discover new climbs.',
  openGraph: {
    title: 'Interactive Climbing Map - gsyrocks',
    description: 'Explore climbing routes across Guernsey.',
    url: '/map',
  },
}

export default function MapLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
