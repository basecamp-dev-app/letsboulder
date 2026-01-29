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
    .select('name, region_name, country, regions(name)')
    .eq('id', id)
    .single()

  if (!crag) {
    return {
      title: 'Crag Not Found',
      description: 'This crag could not be found.',
    }
  }

  const regionName = crag.regions && Array.isArray(crag.regions) && crag.regions.length > 0 ? crag.regions[0].name : null
  const locationParts = [crag.region_name, regionName, crag.country].filter(Boolean) as string[]
  const title = locationParts.length > 0 ? `${crag.name}, ${locationParts[0]}` : `${crag.name}`
  const locationSuffix = locationParts.length > 0 ? ` in ${locationParts.join(', ')}` : ''

  return {
    title,
    description: `View climbing routes at ${crag.name}${locationSuffix}. Discover photo topos, beta, access info, and nearby climbs.`,
    alternates: {
      canonical: `/crag/${id}`,
    },
    openGraph: {
      title: `${title} | letsboulder`,
      description: `View climbing routes at ${crag.name}${locationSuffix}.`,
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
