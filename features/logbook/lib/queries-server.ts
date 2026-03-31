import type { User } from '@supabase/supabase-js'
import { getServerClient } from '@/lib/supabase-server'
import { getGradePoints } from '@/lib/grades'
import type { Submission } from '@/types/submissions'

interface RawLogbookRow {
  id: string
  climb_id: string
  style: string
  created_at: string
  climbs: {
    id: string
    name: string
    grade: string
    route_lines?: Array<{ images?: { url?: string; crags?: { name?: string } } }>
  }
}

interface LoggedClimb {
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

interface LogbookProfile {
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

export async function fetchServerLogbookData(user: User): Promise<OwnLogbookData> {
  const supabase = await getServerClient()
  const userId = user.id

  const [{ data: profileData, error: profileError }, { data: logsData, error: logsError }] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, username, display_name, avatar_url, bio, total_climbs, total_points, highest_grade')
      .eq('id', userId)
      .single(),
    supabase
      .from('user_climbs')
      .select('*, climbs(id, name, grade, route_lines!inner(images!inner(url, crags!inner(name))))')
      .eq('user_id', userId)
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

  const submissionsRes = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || ''}/api/logbook/contributions?limit=24`)
  let submissions: Submission[] = []
  if (submissionsRes.ok) {
    const payload = await submissionsRes.json().catch(() => ({ submissions: [] as Submission[] }))
    submissions = (payload.submissions || []).map((s: Submission) => ({
      ...s,
      status: s.status === 'published' || s.status === 'pending_review' ? s.status : 'pending_review',
    }))
  }

  return {
    user,
    logs: logsWithPoints,
    profile: (profileData || null) as LogbookProfile | null,
    submissions,
  }
}