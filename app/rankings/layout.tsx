import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Rankings',
  description: 'See the most active climbers in Guernsey. Weekly rankings tracking sends, flashes, and attempts.',
  openGraph: {
    title: 'Rankings - gsyrocks',
    description: 'See the most active climbers in Guernsey.',
    url: '/rankings',
    images: [
      {
        url: '/logo.png',
        width: 1200,
        height: 630,
        alt: 'Rankings - gsyrocks',
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
