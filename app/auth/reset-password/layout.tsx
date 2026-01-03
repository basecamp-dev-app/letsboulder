import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Reset Password',
  description: 'Reset your gsyrocks password to regain access to your climbing logbook and route uploads.',
  robots: {
    index: false,
    follow: false,
  },
}

export default function ResetPasswordLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
