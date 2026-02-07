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
  const { data: climb } = await supabase
    .from('climbs')
    .select('name, grade, slug, crag_id, crags:crag_id (slug, country_code)')
    .eq('id', id)
    .single()

  if (!climb) {
    return {
      title: 'Climb Not Found',
      description: 'This climb could not be found.',
    }
  }

  const cragJoin = (climb as unknown as { crags?: Array<{ slug: string | null; country_code: string | null }> | null }).crags
  const crag = Array.isArray(cragJoin) && cragJoin.length > 0 ? cragJoin[0] : null
  const canonicalPath = climb.slug && crag?.slug && crag?.country_code
    ? `/${crag.country_code.toLowerCase()}/${crag.slug}/${climb.slug}`
    : `/climb/${id}`

  return {
    title: `${climb.name} (${climb.grade})`,
    description: `Climb ${climb.name} graded ${climb.grade}. View topo and beta, log your ascent, and track your progress.`,
    alternates: {
      canonical: canonicalPath,
    },
    openGraph: {
      title: `${climb.name} (${climb.grade}) | letsboulder`,
      description: `Climb ${climb.name} graded ${climb.grade}.`,
      url: canonicalPath,
    },
    twitter: {
      card: 'summary_large_image',
      title: `${climb.name} (${climb.grade}) | letsboulder`,
      description: `Climb ${climb.name} graded ${climb.grade}.`,
      images: ['/og.png'],
    },
  }
}

export default function ClimbLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
