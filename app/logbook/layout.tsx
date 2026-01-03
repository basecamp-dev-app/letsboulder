import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'My Climbing Logbook',
  description: 'View and manage your personal climbing logbook on gsyrocks. Track your climbing achievements and progress in Guernsey.',
  openGraph: {
    title: 'My Climbing Logbook - gsyrocks',
    description: 'View and manage your personal climbing logbook on gsyrocks.',
    url: '/logbook',
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
