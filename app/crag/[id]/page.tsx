import { createServerClient } from '@supabase/ssr'
import { notFound, permanentRedirect } from 'next/navigation'
import CragPageClient from '@/app/crag/components/CragPageClient'
import type { Crag } from '@/app/crag/components/CragPageClient'
import { loadPlaceCommunityData } from '@/features/community/server/load-place-community-data'

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
    .select(`
      id,
      name,
      slug,
      country_code,
      latitude,
      longitude,
      region_id,
      description,
      access_notes,
      rock_type,
      type,
      regions:region_id (id, name)
    `)
    .eq('id', id)
    .single()

  if (!crag) notFound()

  if (crag.slug && crag.country_code) {
    permanentRedirect(`/${crag.country_code.toLowerCase()}/${crag.slug}`)
  }

  const initialCrag: Crag = {
    ...crag,
    regions: Array.isArray(crag.regions) ? crag.regions[0] : crag.regions,
  }

  const communityData = await loadPlaceCommunityData(supabase, id)

  return (
    <CragPageClient
      id={id}
      initialCrag={initialCrag}
      communityPlaceId={communityData.placeId}
      communityPlaceSlug={communityData.placeSlug}
      initialSessionPosts={communityData.sessionPosts}
      initialUpdatePosts={communityData.updatePosts}
    />
  )
}
