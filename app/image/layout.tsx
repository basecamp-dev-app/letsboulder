import { Metadata } from 'next'

export const revalidate = 300

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  const title = 'Route Image'

  return {
    title,
    description: 'View climbing route image on letsboulder. Explore routes, grades, and climbing details.',
    robots: {
      index: false,
      follow: true,
    },
    alternates: {
      canonical: `/image/${id}`,
    },
    openGraph: {
      title: `${title} | letsboulder`,
      description: 'View climbing route image on letsboulder.',
      url: `/image/${id}`,
      images: [{ url: '/og.png', width: 1200, height: 630, alt: 'letsboulder' }],
    },
    twitter: {
      card: 'summary_large_image',
      title: `${title} | letsboulder`,
      description: 'View climbing route image on letsboulder.',
      images: ['/og.png'],
    },
  }
}

export default function ImageLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
