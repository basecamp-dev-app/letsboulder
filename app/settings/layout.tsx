import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Settings - gsyrocks',
  description: 'Manage your account settings and preferences',
  openGraph: {
    title: 'Settings - gsyrocks',
    description: 'Manage your account settings and preferences',
    url: '/settings',
    images: [
      {
        url: '/logo.png',
        width: 1200,
        height: 630,
        alt: 'Settings - gsyrocks',
      },
    ],
  },
}

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
