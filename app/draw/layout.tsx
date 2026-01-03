import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Draw Route',
  description: 'Draw and mark climbing route paths on your photos to document and share climbing routes in Guernsey.',
  openGraph: {
    title: 'Draw Route - gsyrocks',
    description: 'Draw and mark climbing route paths on your photos.',
    url: '/draw',
  },
}

export default function DrawLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
