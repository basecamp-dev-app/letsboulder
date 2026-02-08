import { createServerClient } from '@supabase/ssr'
import { notFound, permanentRedirect } from 'next/navigation'
import CragPageClient from '@/app/crag/components/CragPageClient'

export const revalidate = 300

export default async function CragIdPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return [] }, setAll() {} } }
  )

  const { data: crag } = await supabase
    .from('crags')
    .select('id, slug, country_code')
    .eq('id', id)
    .single()

  if (!crag) notFound()

  if (crag.slug && crag.country_code) {
    permanentRedirect(`/${crag.country_code.toLowerCase()}/${crag.slug}`)
  }

  return <CragPageClient id={id} canonicalPath={`/crag/${id}`} />
}
