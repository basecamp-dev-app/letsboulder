import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Gear',
  description: 'Climbing gear recommendations from letsboulder. Curated Amazon affiliate links for bouldering and rock climbing equipment.',
  alternates: {
    canonical: '/gear',
  },
  openGraph: {
    title: 'Gear - letsboulder',
    description: 'Climbing gear recommendations from letsboulder.',
    url: '/gear',
    images: [
      {
        url: '/og.png',
        width: 1200,
        height: 630,
        alt: 'Gear - letsboulder',
      },
    ],
  },
}

export default function GearLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <>{children}</>
}
