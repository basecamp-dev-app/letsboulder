import { Metadata } from 'next'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } }
  )

  const { id } = await params
  const { data: image } = await supabase
    .from('images')
    .select('url, crags(name)')
    .eq('id', id)
    .eq('moderation_status', 'approved')
    .single()

  if (!image) {
    return {
      title: 'Image Not Found',
      description: 'This route image could not be found.',
    }
  }

  const cragName = image.crags && Array.isArray(image.crags) && image.crags.length > 0 ? image.crags[0].name : null
  const title = `Route Image${cragName ? ` at ${cragName}` : ''}`

  return {
    title,
    description: `View climbing route image${cragName ? ` at ${cragName}` : ''} on letsboulder. Explore routes, grades, and climbing details.`,
    alternates: {
      canonical: `/image/${id}`,
    },
    openGraph: {
      title: `${title} | letsboulder`,
      description: `View climbing route image${cragName ? ` at ${cragName}` : ''} on letsboulder.`,
      url: `/image/${id}`,
      images: image.url ? [{ url: image.url, width: 1200, height: 630, alt: 'Route image' }] : [],
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
