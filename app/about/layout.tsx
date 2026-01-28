import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'About',
  description: 'Learn about letsboulder - Guernsey climbing community platform. Discover routes, log your ascents, and connect with local climbers.',
  alternates: {
    canonical: '/about',
  },
  openGraph: {
    title: 'About letsboulder',
    description: 'Learn about Guernsey climbing community platform.',
    url: '/about',
    images: [
      {
        url: '/logo.png',
        width: 1200,
        height: 630,
        alt: 'About letsboulder',
      },
    ],
  },
}

export default function AboutLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
