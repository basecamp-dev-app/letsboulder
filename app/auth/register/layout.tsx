import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Create Account',
  description: 'Create your letsboulder account to start logging climbs and building your personal climbing logbook.',
  robots: {
    index: false,
    follow: false,
  },
}

export default function RegisterLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
