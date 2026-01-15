import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Loading Logbook...',
  robots: {
    index: false,
    follow: true,
  },
}

export default function LogbookUserLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
