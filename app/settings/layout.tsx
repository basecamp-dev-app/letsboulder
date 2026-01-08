import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Settings - gsyrocks',
  description: 'Manage your account settings and preferences',
}

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
