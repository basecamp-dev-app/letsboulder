import type { User } from '@supabase/supabase-js'
import { getGradePoints } from '@/lib/grades'
import { csrfFetch } from '@/lib/csrf-client'
import { fetchOwnSubmissions } from '@/features/submissions/lib/fetch-own-submissions'
import { createClient } from '@/lib/supabase'
import type { LogbookClimb, LogbookLifetimeStats, ProgressLogEntry } from '@/features/logbook/lib/logbook-view'
import type { Database } from '@/types/database'
import type { Submission } from '@/types/submissions'
import { fetchSavedClimbs, fetchSavedCrags } from '@/features/saved/lib/queries'
import { getOwnProfile } from '@/lib/profile-rpc'
import { DETAILED_LOGBOOK_SELECT } from '@/features/logbook/lib/query-selects'
import type { LogbookViewModel } from '@/features/logbook/lib/logbook-contract'

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

export type OwnLogbookData = Omit<LogbookViewModel, 'user' | 'isOwnProfile'> & {
  user: User | null
  isOwnProfile?: true
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

type LogbookLifetimeStatsRow = Database['public']['Functions']['get_logbook_lifetime_stats']['Returns'][number]

const INITIAL_LOGBOOK_LOG_LIMIT = 24

export const ownLogbookSummaryQueryKey = ['logbook', 'own', 'summary'] as const
export const ownLogbookSubmissionsQueryKey = ['logbook', 'own', 'submissions'] as const
export const ownLogbookLogsQueryKeyPrefix = ['logbook', 'own', 'logs'] as const

export function ownLogbookLogsQueryKey(userId: string) {
  return [...ownLogbookLogsQueryKeyPrefix, userId] as const
}

function emptySubmissionCounts() {
  return {
    all: 0,
    drafts: 0,
    'pending-review': 0,
    published: 0,
  }
}

function emptyLifetimeStats(): LogbookLifetimeStats {
  return {
    totalClimbs: 0,
    totalFlashes: 0,
    totalTops: 0,
    totalTries: 0,
  }
}

async function mapDetailedLogbookRows(
  supabase: ReturnType<typeof createClient>,
  rows: unknown[],
): Promise<LogbookClimb[]> {
  const logsWithCrags = (rows as RawLogbookRow[]).map((log) => {
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

  const logsWithPoints = logsWithCrags.map((log) => ({
    ...log,
    points: log.style === 'flash'
      ? getGradePoints(log.climbs?.grade) + 10
      : getGradePoints(log.climbs?.grade),
  })) as LogbookClimb[]

  const cragIds = [...new Set(logsWithPoints.map((log) => log.climbs?.crag_id).filter((id): id is string => !!id))]
  const cragMetaById = new Map<string, { country_code: string | null; slug: string | null }>()
  if (cragIds.length > 0) {
    const { data: cragRows, error } = await supabase
      .from('crags')
      .select('id, country_code, slug')
      .in('id', cragIds)
    if (error) throw error

    for (const row of cragRows || []) {
      cragMetaById.set(row.id, { country_code: row.country_code, slug: row.slug })
    }
  }

  return logsWithPoints.map((log) => {
    const cragId = log.climbs?.crag_id
    const cragMeta = cragId ? cragMetaById.get(cragId) : null
    const climbSlug = log.climbs?.slug
    const canonicalUrl = cragMeta?.country_code && cragMeta?.slug && climbSlug
      ? `/${cragMeta.country_code.toLowerCase()}/${cragMeta.slug}/${climbSlug}`
      : null
    return { ...log, canonical_url: canonicalUrl }
  })
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
        return { user: null, userId: '', isOwnProfile: true, isPublic: true, logs: [], nextCursor: null, progressLogs: [], lifetimeStats: emptyLifetimeStats(), profile: null, submissions: [], savedClimbs: [], savedCrags: [], submissionCounts: emptySubmissionCounts() }
      }
      throw userError
    }

    user = authUser
  }

  if (!user) {
    return { user: null, userId: '', isOwnProfile: true, isPublic: true, logs: [], nextCursor: null, progressLogs: [], lifetimeStats: emptyLifetimeStats(), profile: null, submissions: [], savedClimbs: [], savedCrags: [], submissionCounts: emptySubmissionCounts() }
  }

  const userId = user.id
  const supabase = createClient()

  const [{ data: profileData, error: profileError }, { data: logsData, error: logsError }, { data: lifetimeStatsData, error: lifetimeStatsError }] = await Promise.all([
    getOwnProfile(supabase),
    supabase
      .from('user_climbs')
      .select(DETAILED_LOGBOOK_SELECT)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(INITIAL_LOGBOOK_LOG_LIMIT),
    supabase.rpc('get_logbook_lifetime_stats', { p_user_id: userId }).single(),
  ])

  if (profileError && profileError.code !== 'PGRST116') {
    throw profileError
  }

  if (logsError) {
    throw logsError
  }

  if (lifetimeStatsError) {
    throw lifetimeStatsError
  }

  const logsWithUrls = await mapDetailedLogbookRows(supabase, logsData || [])
  const lifetimeStats = lifetimeStatsData as LogbookLifetimeStatsRow | null

  const submissions = await fetchOwnSubmissions(supabase, userId, csrfFetch, 24)
  const [savedClimbs, savedCrags] = await Promise.all([
    fetchSavedClimbs(supabase, userId),
    fetchSavedCrags(supabase, userId),
  ])

  return {
    user,
    userId,
    isOwnProfile: true,
    isPublic: true,
    logs: logsWithUrls,
    nextCursor: logsWithUrls.length === INITIAL_LOGBOOK_LOG_LIMIT ? logsWithUrls[logsWithUrls.length - 1]?.created_at || null : null,
    progressLogs: logsWithUrls.map((log) => ({
      id: log.id,
      climb_id: log.climb_id,
      style: log.style,
      created_at: log.created_at,
      date_climbed: log.date_climbed,
      climbs: {
        id: log.climbs.id,
        name: log.climbs.name,
        grade: log.climbs.grade,
      },
    })) as ProgressLogEntry[],
    lifetimeStats: {
      totalClimbs: lifetimeStats?.total_climbs ?? 0,
      totalFlashes: lifetimeStats?.total_flashes ?? 0,
      totalTops: lifetimeStats?.total_tops ?? 0,
      totalTries: lifetimeStats?.total_tries ?? 0,
    },
    profile: (profileData || null) as LogbookProfile | null,
    submissions,
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
