import { getDisplayName, type ProfileRow } from '@/lib/profile-helpers'
import { getUnauthenticatedClient } from '@/lib/supabase-server'

const COMMUNITY_NOTE_LIMIT = 10

export interface RoutePageCommunityNote {
  userId: string
  displayName: string
  notes: string
  createdAt: string | null
}

interface UserClimbNoteRow {
  user_id: string
  notes: string | null
  created_at: string | null
}

export async function loadRoutePageCommunityNotes(effectiveClimbId: string): Promise<RoutePageCommunityNote[]> {
  const supabase = getUnauthenticatedClient()
  const { data, error } = await supabase
    .from('user_climbs')
    .select('user_id, notes, created_at')
    .eq('climb_id', effectiveClimbId)
    .not('notes', 'is', null)
    .order('created_at', { ascending: false })
    .limit(COMMUNITY_NOTE_LIMIT)

  if (error) {
    throw error
  }

  const meaningfulRows = ((data || []) as UserClimbNoteRow[])
    .map((row) => ({
      user_id: row.user_id,
      notes: row.notes?.trim() || '',
      created_at: row.created_at,
    }))
    .filter((row) => row.notes.length > 0)

  if (meaningfulRows.length === 0) {
    return []
  }

  const userIds = Array.from(new Set(meaningfulRows.map((row) => row.user_id)))
  const { data: profilesData } = await supabase
    .from('profiles')
    .select('id, username, display_name, first_name, last_name, avatar_url, is_public')
    .in('id', userIds)

  const profileMap = new Map(((profilesData || []) as ProfileRow[]).map((profile) => [profile.id, profile]))

  return meaningfulRows.map((row) => {
    const profile = profileMap.get(row.user_id)
    const displayName = profile?.is_public ? getDisplayName(profile) : 'Anonymous'

    return {
      userId: row.user_id,
      displayName,
      notes: row.notes,
      createdAt: row.created_at,
    }
  })
}
