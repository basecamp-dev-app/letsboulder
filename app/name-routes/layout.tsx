import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Review Routes',
  description: 'Review and name newly submitted climbing routes before they are published to the gsyrocks map.',
  openGraph: {
    title: 'Review Routes - gsyrocks',
    description: 'Review and name climbing routes before publishing.',
    url: '/name-routes',
  },
}

export default function NameRoutesLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
