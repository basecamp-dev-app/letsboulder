import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'My Climbing Logbook',
  description: 'View and manage your personal climbing logbook on gsyrocks. Track your climbing achievements and progress in Guernsey.',
  openGraph: {
    title: 'My Climbing Logbook - gsyrocks',
    description: 'View and manage your personal climbing logbook on gsyrocks.',
    url: '/logbook',
    images: [
      {
        url: '/logo.png',
        width: 1200,
        height: 630,
        alt: 'My Climbing Logbook - gsyrocks',
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
