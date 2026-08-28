import { Metadata } from 'next'
import StandaloneLayout from '@/components/StandaloneLayout'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Authentication',
  description: 'Sign in or create your letsboulder account to access climbing routes and logbook features.',
  robots: {
    index: false,
    follow: false,
  },
}

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <StandaloneLayout backLabel="Back to home">
      {children}
    </StandaloneLayout>
  )
}
