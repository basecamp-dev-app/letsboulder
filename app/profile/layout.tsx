import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'My Profile',
  description: 'Manage your gsyrocks profile. View your account information, climbing logbook, and uploaded routes.',
  openGraph: {
    title: 'My Profile - gsyrocks',
    description: 'Manage your gsyrocks profile and view your climbing activity.',
    url: '/profile',
  },
  robots: {
    index: false,
    follow: true,
  },
}

export default function ProfileLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
