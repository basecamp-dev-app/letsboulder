import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Community Impact',
  description: 'See the collective impact of our climbing community. Documented routes, mapped crags, successful sends, and community contributions.',
  alternates: {
    canonical: '/impact',
  },
  openGraph: {
    title: 'Community impact - letsboulder',
    description: 'See the collective impact of our climbing community.',
    url: '/impact',
    images: [
      {
        url: '/og.png',
        width: 1200,
        height: 630,
        alt: 'Community impact - letsboulder',
      },
    ],
  },
}

export default function ImpactLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <>{children}</>
}
