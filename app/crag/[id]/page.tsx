import { createServerClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'
import { notFound, permanentRedirect } from 'next/navigation'
import CragPageClient from '@/app/crag/components/CragPageClient'
import type { Crag } from '@/app/crag/components/CragPageClient'
import type { CommunitySessionPost, CommunityUpdatePost } from '@/types/community'

export const revalidate = 300

interface SessionPostRow {
  id: string
  author_id: string
  place_id: string
  type: 'session'
  title: string | null
  body: string
  discipline: string | null
  grade_min: string | null
  grade_max: string | null
  start_at: string
  end_at: string | null
  created_at: string
  updated_at: string
}

interface UpdatePostRow {
  id: string
  author_id: string
  place_id: string
  type: 'update' | 'conditions' | 'question'
  title: string | null
  body: string
  discipline: string | null
  created_at: string
  updated_at: string
}

interface ProfileRow {
  id: string
  username: string | null
  display_name: string | null
  avatar_url: string | null
}

async function loadCragCommunityData(supabase: SupabaseClient, placeId: string) {
  const { data: place } = await supabase
    .from('places')
    .select('id, slug')
    .eq('id', placeId)
    .eq('type', 'crag')
    .maybeSingle()

  const [{ data: sessionRows }, { data: updateRows }] = await Promise.all([
    supabase
      .from('community_posts')
      .select('id, author_id, place_id, type, title, body, discipline, grade_min, grade_max, start_at, end_at, created_at, updated_at')
      .eq('place_id', placeId)
      .eq('type', 'session')
      .gte('start_at', new Date().toISOString())
      .order('start_at', { ascending: true })
      .limit(100),
    supabase
      .from('community_posts')
      .select('id, author_id, place_id, type, title, body, discipline, created_at, updated_at')
      .eq('place_id', placeId)
      .in('type', ['update', 'conditions', 'question'])
      .order('created_at', { ascending: false })
      .limit(100),
  ])

  const typedSessionRows = (sessionRows || []) as SessionPostRow[]
  const typedUpdateRows = (updateRows || []) as UpdatePostRow[]
  const authorIds = Array.from(new Set([
    ...typedSessionRows.map((post) => post.author_id),
    ...typedUpdateRows.map((post) => post.author_id),
  ]))

  const profileMap = new Map<string, ProfileRow>()
  if (authorIds.length > 0) {
    const { data: profileRows } = await supabase
      .from('profiles')
      .select('id, username, display_name, avatar_url')
      .in('id', authorIds)

    for (const row of (profileRows || []) as ProfileRow[]) {
      profileMap.set(row.id, row)
    }
  }

  const sessionPosts: CommunitySessionPost[] = typedSessionRows.map((post) => ({
    ...post,
    author: profileMap.get(post.author_id) || null,
  }))
  const updatePosts: CommunityUpdatePost[] = typedUpdateRows.map((post) => ({
    ...post,
    author: profileMap.get(post.author_id) || null,
  }))

  return {
    placeId: place?.id || placeId,
    placeSlug: place?.slug || null,
    sessionPosts,
    updatePosts,
  }
}

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

  const communityData = await loadCragCommunityData(supabase, id)

  return (
    <CragPageClient
      id={id}
      initialCrag={initialCrag}
      canonicalPath={`/crag/${id}`}
      communityPlaceId={communityData.placeId}
      communityPlaceSlug={communityData.placeSlug}
      initialSessionPosts={communityData.sessionPosts}
      initialUpdatePosts={communityData.updatePosts}
    />
  )
}
