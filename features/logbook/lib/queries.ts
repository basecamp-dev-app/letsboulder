import type { User } from '@supabase/supabase-js'
import { getGradePoints } from '@/lib/grades'
import { csrfFetch } from '@/lib/csrf-client'
import { fetchOwnSubmissions } from '@/features/submissions/lib/fetch-own-submissions'
import { createClient } from '@/lib/supabase'
import type { Submission } from '@/types/submissions'

export interface LoggedClimb {
  id: string
  climb_id: string
  style: string
  created_at: string
  points?: number
  canonical_url?: string | null
  climbs: {
    id: string
    name: string
    grade: string
    slug?: string | null
    crag_id?: string | null
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
    slug?: string | null
    crag_id?: string | null
    route_lines?: Array<{ images?: { url?: string; crags?: { name?: string } } }>
  }
}

export const ownLogbookQueryKey = ['logbook', 'own'] as const

export async function fetchOwnLogbookData(passedUser?: User | null): Promise<OwnLogbookData> {
  let user: User | null = passedUser ?? null

  if (!user) {
    const supabase = createClient()
    const {
      data: { user: authUser },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError) {
      if (userError.name === 'AuthSessionMissingError' || userError.message.includes('session')) {
        return { user: null, logs: [], profile: null, submissions: [] }
      }
      throw userError
    }

    user = authUser
  }

  if (!user) {
    return { user: null, logs: [], profile: null, submissions: [] }
  }

  const userId = user.id
  const supabase = createClient()

  const [{ data: profileData, error: profileError }, { data: logsData, error: logsError }] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, username, display_name, avatar_url, bio, total_climbs, total_points, highest_grade')
      .eq('id', userId)
      .single(),
    supabase
      .from('user_climbs')
      .select('*, climbs(id, name, grade, slug, crag_id, route_lines(images(url, crags(name))))')
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

  const cragIds = [...new Set(logsWithPoints.map((log) => log.climbs?.crag_id).filter((id): id is string => !!id))]
  const cragMetaById = new Map<string, { country_code: string | null; slug: string | null }>()
  if (cragIds.length > 0) {
    const { data: cragRows } = await supabase
      .from('crags')
      .select('id, country_code, slug')
      .in('id', cragIds)
    for (const row of (cragRows || []) as Array<{ id: string; country_code: string | null; slug: string | null }>) {
      cragMetaById.set(row.id, { country_code: row.country_code, slug: row.slug })
    }
  }

  const logsWithUrls = logsWithPoints.map((log) => {
    const cragId = log.climbs?.crag_id
    const cragMeta = cragId ? cragMetaById.get(cragId) : null
    const climbSlug = log.climbs?.slug
    const canonicalUrl = cragMeta?.country_code && cragMeta?.slug && climbSlug
      ? `/${cragMeta.country_code.toLowerCase()}/${cragMeta.slug}/${climbSlug}`
      : null
    return { ...log, canonical_url: canonicalUrl }
  })

  const submissions = await fetchOwnSubmissions(supabase, userId, csrfFetch, 24)

  return {
    user,
    logs: logsWithUrls,
    profile: (profileData || null) as LogbookProfile | null,
    submissions,
  }
}