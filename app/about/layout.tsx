import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'About',
  description: 'Learn about letsboulder. Discover routes, log your ascents, and contribute to a community-driven climbing database.',
  alternates: {
    canonical: '/about',
  },
  openGraph: {
    title: 'About letsboulder',
    description: 'Learn about a community-driven climbing platform.',
    url: '/about',
    images: [
      {
        url: '/og.png',
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
