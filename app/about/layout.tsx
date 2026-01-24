import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'About gsyrocks',
  description: 'Learn about gsyrocks - Guernsey climbing community platform. Discover routes, log your ascents, and connect with local climbers.',
  openGraph: {
    title: 'About gsyrocks',
    description: 'Learn about Guernsey climbing community platform.',
    url: '/about',
    images: [
      {
        url: '/logo.png',
        width: 1200,
        height: 630,
        alt: 'About gsyrocks',
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
