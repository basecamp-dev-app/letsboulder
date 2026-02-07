import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Interactive Climbing Map',
  description: 'Explore bouldering and climbing routes worldwide on an interactive map. Find crags, view photo topos, and discover new climbs.',
  alternates: {
    canonical: '/',
  },
  openGraph: {
    title: 'Interactive Climbing Map - letsboulder',
    description: 'Explore bouldering and climbing routes worldwide.',
    url: '/',
    images: [
      {
        url: '/og.png',
        width: 1200,
        height: 630,
        alt: 'Interactive Climbing Map - letsboulder',
      },
    ],
  },
}

export default function MapLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
