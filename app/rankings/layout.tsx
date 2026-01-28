import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Rankings',
  description: 'See the most active climbers in Guernsey. Weekly rankings tracking sends, flashes, and attempts.',
  alternates: {
    canonical: '/rankings',
  },
  openGraph: {
    title: 'Rankings - letsboulder',
    description: 'See the most active climbers in Guernsey.',
    url: '/rankings',
    images: [
      {
        url: '/og.png',
        width: 1200,
        height: 630,
        alt: 'Rankings - letsboulder',
      },
    ],
  },
}

export default function RankingsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
