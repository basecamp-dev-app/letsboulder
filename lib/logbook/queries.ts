import type { User } from '@supabase/supabase-js'
import { getGradePoints } from '@/lib/grades'
import { csrfFetch } from '@/hooks/useCsrf'
import { fetchOwnSubmissions } from '@/lib/submissions/fetch-own-submissions'
import { createClient } from '@/lib/supabase'
import type { Submission } from '@/types/submissions'

export interface LoggedClimb {
  id: string
  climb_id: string
  style: string
  created_at: string
  points?: number
  climbs: {
    id: string
    name: string
    grade: string
    image_url?: string
    crags: {
      name: string
    }
  }
}

export interface LogbookProfile {
  id: string
  username: string
  display_name?: string
  avatar_url?: string
  bio?: string
  total_climbs?: number
  total_points?: number
  highest_grade?: string
}

export interface OwnLogbookData {
  user: User | null
  logs: LoggedClimb[]
  profile: LogbookProfile | null
  submissions: Submission[]
}

interface RawLogbookRow {
  id: string
  climb_id: string
  style: string
  created_at: string
  climbs: {
    id: string
    name: string
    grade: string
    route_lines?: Array<{ images?: { url?: string; crags?: { name: string } } }>
  }
}

export const ownLogbookQueryKey = ['logbook', 'own'] as const

export async function fetchOwnLogbookData(): Promise<OwnLogbookData> {
  const supabase = createClient()
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError) {
    if (userError.name === 'AuthSessionMissingError' || userError.message.includes('session')) {
      return { user: null, logs: [], profile: null, submissions: [] }
    }
    throw userError
  }

  if (!user) {
    return { user: null, logs: [], profile: null, submissions: [] }
  }

  const [{ data: profileData, error: profileError }, { data: logsData, error: logsError }] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, username, display_name, avatar_url, bio, total_climbs, total_points, highest_grade')
      .eq('id', user.id)
      .single(),
    supabase
      .from('user_climbs')
      .select('*, climbs(id, name, grade, route_lines!inner(images!inner(url, crags!inner(name))))')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false }),
  ])

  if (profileError && profileError.code !== 'PGRST116') {
    throw profileError
  }

  if (logsError) {
    throw logsError
  }

  const logsWithCrags = ((logsData || []) as RawLogbookRow[]).map((log) => {
    const routeLines = log.climbs?.route_lines
    const cragName = routeLines?.[0]?.images?.crags?.name || 'Unknown crag'
    const imageUrl = routeLines?.[0]?.images?.url

    return {
      ...log,
      climbs: {
        ...log.climbs,
        image_url: imageUrl,
        crags: { name: cragName },
      },
    }
  })

  const logsWithPoints = logsWithCrags.map((log: RawLogbookRow & LoggedClimb) => ({
    ...log,
    points: log.style === 'flash'
      ? getGradePoints(log.climbs?.grade) + 10
      : getGradePoints(log.climbs?.grade),
  })) as LoggedClimb[]

  const submissions = await fetchOwnSubmissions(supabase, user.id, csrfFetch, 24)

  return {
    user,
    logs: logsWithPoints,
    profile: (profileData || null) as LogbookProfile | null,
    submissions,
  }
}
