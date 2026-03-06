import type { SupabaseClient } from '@supabase/supabase-js'
import type { CommunitySessionPost, CommunityUpdatePost } from '@/types/community'

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

export async function loadPlaceCommunityData(supabase: SupabaseClient, placeId: string) {
  const { data: place } = await supabase
    .from('places')
    .select('id, slug')
    .eq('id', placeId)
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
