import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Auth Callback',
  robots: {
    index: false,
    follow: false,
  },
}

export default function CallbackLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
