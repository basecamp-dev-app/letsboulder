import type { User } from '@supabase/supabase-js'
import { getGradePoints } from '@/lib/grades'
import { csrfFetch } from '@/lib/csrf-client'
import { fetchOwnSubmissions } from '@/features/submissions/lib/fetch-own-submissions'
import { createClient } from '@/lib/supabase'
import type { LogbookClimb, ProgressLogEntry } from '@/features/logbook/lib/logbook-view'
import type { Submission } from '@/types/submissions'
import { fetchSavedClimbs, fetchSavedCrags } from '@/features/saved/lib/queries'
import type { SavedClimb, SavedCrag } from '@/features/saved/lib/types'

export interface LogbookProfile {
  id: string
  username: string
  display_name?: string
  avatar_url?: string
  bio?: string
  total_climbs?: number
  total_points?: number
  highest_grade?: string
  contributor_score_total?: number
  accepted_contribution_count?: number
  contributor_tier?: string | null
}

export interface OwnLogbookData {
  user: User | null
  logs: LogbookClimb[]
  progressLogs: ProgressLogEntry[]
  profile: LogbookProfile | null
  savedClimbs: SavedClimb[]
  savedCrags: SavedCrag[]
  submissionCounts: {
    all: number
    drafts: number
    'pending-review': number
    published: number
  }
}

interface RawProgressLogRow {
  id: string
  climb_id: string
  style: string
  created_at: string
  date_climbed?: string | null
  climbs: {
    id: string
    name: string | null
    grade: string
  } | null
}

interface RawLogbookRow {
  id: string
  climb_id: string
  style: string
  created_at: string
  date_climbed?: string | null
  climbs: {
    id: string
    name: string
    grade: string
    slug?: string | null
    crag_id?: string | null
    route_lines?: Array<{ images?: { url?: string; crags?: { name?: string } } }>
  }
}

const INITIAL_LOGBOOK_LOG_LIMIT = 24
const PROGRESS_LOG_LIMIT = 2000

export const ownLogbookSummaryQueryKey = ['logbook', 'own', 'summary'] as const
export const ownLogbookSubmissionsQueryKey = ['logbook', 'own', 'submissions'] as const

function emptySubmissionCounts() {
  return {
    all: 0,
    drafts: 0,
    'pending-review': 0,
    published: 0,
  }
}

export async function fetchOwnLogbookSummary(passedUser?: User | null): Promise<OwnLogbookData> {
  let user: User | null = passedUser ?? null

  if (!user) {
    const supabase = createClient()
    const {
      data: { user: authUser },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError) {
      if (userError.name === 'AuthSessionMissingError' || userError.message.includes('session')) {
        return { user: null, logs: [], progressLogs: [], profile: null, savedClimbs: [], savedCrags: [], submissionCounts: emptySubmissionCounts() }
      }
      throw userError
    }

    user = authUser
  }

  if (!user) {
    return { user: null, logs: [], progressLogs: [], profile: null, savedClimbs: [], savedCrags: [], submissionCounts: emptySubmissionCounts() }
  }

  const userId = user.id
  const supabase = createClient()

  const [{ data: profileData, error: profileError }, { data: logsData, error: logsError }, { data: progressLogsData, error: progressLogsError }] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, username, display_name, avatar_url, bio, total_climbs, total_points, highest_grade, contributor_score_total, accepted_contribution_count, contributor_tier')
      .eq('id', userId)
      .single(),
    supabase
      .from('user_climbs')
      .select('id, climb_id, style, created_at, date_climbed, climbs(id, name, grade, slug, crag_id, route_lines(images(url, crags(name))))')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(INITIAL_LOGBOOK_LOG_LIMIT),
    supabase
      .from('user_climbs')
      .select('id, climb_id, style, created_at, date_climbed, climbs(id, name, grade)')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(PROGRESS_LOG_LIMIT),
  ])

  if (profileError && profileError.code !== 'PGRST116') {
    throw profileError
  }

  if (logsError) {
    throw logsError
  }

  if (progressLogsError) {
    throw progressLogsError
  }

  const logsWithCrags = ((logsData || []) as unknown as RawLogbookRow[]).map((log) => {
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

  const logsWithPoints = logsWithCrags.map((log: RawLogbookRow & LogbookClimb) => ({
    ...log,
    points: log.style === 'flash'
      ? getGradePoints(log.climbs?.grade) + 10
      : getGradePoints(log.climbs?.grade),
  })) as LogbookClimb[]

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
  const [savedClimbs, savedCrags] = await Promise.all([
    fetchSavedClimbs(supabase, userId),
    fetchSavedCrags(supabase, userId),
  ])

  return {
    user,
    logs: logsWithUrls,
    progressLogs: (progressLogsData || []) as unknown as RawProgressLogRow[] as ProgressLogEntry[],
    profile: (profileData || null) as LogbookProfile | null,
    savedClimbs,
    savedCrags,
    submissionCounts: {
      all: submissions.length,
      drafts: submissions.filter((submission) => submission.status === 'draft').length,
      'pending-review': submissions.filter((submission) => submission.status === 'pending_review').length,
      published: submissions.filter((submission) => submission.status === 'published').length,
    },
  }
}

export async function fetchOwnLogbookSubmissions(passedUser?: User | null): Promise<Submission[]> {
  let user: User | null = passedUser ?? null

  if (!user) {
    const supabase = createClient()
    const {
      data: { user: authUser },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError) {
      if (userError.name === 'AuthSessionMissingError' || userError.message.includes('session')) {
        return []
      }
      throw userError
    }

    user = authUser
  }

  if (!user) return []

  const supabase = createClient()
  return fetchOwnSubmissions(supabase, user.id, csrfFetch, 24)
}
