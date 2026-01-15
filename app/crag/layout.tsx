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
  const { data: crag } = await supabase
    .from('crags')
    .select('name, regions(name)')
    .eq('id', id)
    .single()

  if (!crag) {
    return {
      title: 'Crag Not Found | gsyrocks',
      description: 'This crag could not be found.',
    }
  }

  const regionName = crag.regions && Array.isArray(crag.regions) && crag.regions.length > 0 ? crag.regions[0].name : null
  const title = regionName ? `${crag.name}, ${regionName} | gsyrocks` : `${crag.name} | gsyrocks`

  return {
    title,
    description: `View climbing routes at ${crag.name} in Guernsey${regionName ? `, ${regionName}` : ''}. Discover routes, access information, and explore this climbing area.`,
    openGraph: {
      title,
      description: `View climbing routes at ${crag.name} in Guernsey${regionName ? `, ${regionName}` : ''}.`,
      url: `/crag/${id}`,
    },
  }
}

export default function CragLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
