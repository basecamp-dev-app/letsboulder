import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'My Climbing Logbook',
  description: 'View and manage your personal climbing logbook on letsboulder. Track your climbing achievements and progress in Guernsey.',
  alternates: {
    canonical: '/logbook',
  },
  openGraph: {
    title: 'My Climbing Logbook - letsboulder',
    description: 'View and manage your personal climbing logbook on letsboulder.',
    url: '/logbook',
    images: [
      {
        url: '/logo.png',
        width: 1200,
        height: 630,
        alt: 'My Climbing Logbook - letsboulder',
      },
    ],
  },
  robots: {
    index: false,
    follow: true,
  },
}

export default function LogbookLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
