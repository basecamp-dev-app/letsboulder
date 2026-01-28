import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Settings',
  description: 'Manage your account settings and preferences',
  alternates: {
    canonical: '/settings',
  },
  openGraph: {
    title: 'Settings - letsboulder',
    description: 'Manage your account settings and preferences',
    url: '/settings',
    images: [
      {
        url: '/og.png',
        width: 1200,
        height: 630,
        alt: 'Settings - letsboulder',
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
