import type { User } from '@supabase/supabase-js'
import { getServerClient } from '@/lib/supabase-server'
import { getGradePoints } from '@/lib/grades'
import { selectPreferredDraftPreviewImage, type DraftPreviewImageRef } from '@/features/submissions/public'
import { groupSubmittedImages } from '@/features/submissions/public'
import type { Submission } from '@/types/submissions'
import type { Database } from '@/types/database'
import { startServerTiming, timeServerStep } from '@/lib/performance/server-timing'
import type { LogbookClimb, LogbookLifetimeStats, ProgressLogEntry } from '@/features/logbook/lib/logbook-view'
import { fetchSavedClimbs, fetchSavedCrags } from '@/features/saved/public'
import { DETAILED_LOGBOOK_SELECT } from '@/features/logbook/lib/query-selects'
import { PUBLIC_DETAILED_LOGBOOK_SELECT } from '@/features/logbook/lib/query-selects'
import { getOwnProfile } from '@/lib/profile-rpc'
import type { LogbookPermissionMode, LogbookPage, LogbookViewModel } from '@/features/logbook/lib/logbook-contract'
import { EMPTY_OWNER_SUBMISSION_COUNTS, LOGBOOK_PAGE_SIZE } from '@/features/logbook/lib/logbook-contract'

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

interface LogbookProfile {
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

interface ContributionRow {
  id: string
  url: string
  created_at: string
  submission_id: string | null
  moderation_status?: string | null
  is_anonymous_submission: boolean | null
  contribution_credit_platform: string | null
  contribution_credit_handle: string | null
  crags: { name?: string } | Array<{ name?: string }> | null
  route_lines: Array<{ count?: number }> | null
}

interface CragImageLinkRow {
  source_image_id: string | null
  linked_image_id: string | null
}

interface DraftSubmissionRow {
  id: string
  created_at: string
  updated_at: string
  crags: { name?: string } | Array<{ name?: string }> | null
  submission_draft_images: Array<{
    id: string
    storage_bucket: string
    storage_path: string
    display_order: number
    processing_status: 'pending' | 'queued' | 'processing' | 'ready' | 'failed' | null
    route_data?: unknown
  }> | null
  submission_draft_routes: Array<{ id: string }> | null
}

const INITIAL_LOGBOOK_LOG_LIMIT = 24

interface PublicContributionRow {
  id: string
  url: string
  created_at: string
  submission_id: string | null
  is_anonymous_submission: boolean | null
  contribution_credit_platform: string | null
  contribution_credit_handle: string | null
  crags: { name?: string; slug?: string | null; country_code?: string | null } | Array<{ name?: string; slug?: string | null; country_code?: string | null }> | null
  route_lines: Array<{ count?: number }> | null
}

interface VisibleProfileRow extends LogbookProfile {
  is_public: boolean
}

interface CragImageLinkRow {
  source_image_id: string | null
  linked_image_id: string | null
}

export type OwnLogbookData = Omit<LogbookViewModel, 'user' | 'isOwnProfile'> & {
  user: User
  isOwnProfile: true
}

export interface ServerLogbookSummary {
  user: User
  logs: LogbookClimb[]
  progressLogs: ProgressLogEntry[]
  lifetimeStats: LogbookLifetimeStats
  profile: LogbookProfile | null
}

function mapLogbookPageRows(rows: unknown[]): LogbookClimb[] {
  return (rows as RawLogbookRow[]).map((log) => {
    const routeLines = log.climbs?.route_lines
    const cragName = routeLines?.[0]?.images?.crags?.name || 'Unknown crag'
    const imageUrl = routeLines?.[0]?.images?.url
    return {
      ...log,
      climbs: { ...log.climbs, image_url: imageUrl, crags: { name: cragName } },
      points: log.style === 'flash' ? getGradePoints(log.climbs?.grade) + 10 : getGradePoints(log.climbs?.grade),
    }
  }) as LogbookClimb[]
}

function mapProgressLogRows(logs: LogbookClimb[]): ProgressLogEntry[] {
  return logs.map((log) => ({
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
  }))
}

export async function fetchServerLogbookPage(
  userId: string,
  mode: LogbookPermissionMode,
  cursor?: string,
): Promise<LogbookPage> {
  const supabase = await getServerClient()
  const select = mode === 'owner' ? DETAILED_LOGBOOK_SELECT : PUBLIC_DETAILED_LOGBOOK_SELECT
  let query = supabase
    .from('user_climbs')
    .select(select)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(LOGBOOK_PAGE_SIZE)

  if (cursor) query = query.lt('created_at', cursor)

  const { data, error } = await query
  if (error) throw error

  const logs = mapLogbookPageRows(data || [])
  return {
    logs,
    progressLogs: mapProgressLogRows(logs),
    nextCursor: logs.length === LOGBOOK_PAGE_SIZE ? logs[logs.length - 1]?.created_at || null : null,
  }
}

async function fetchPublicSubmissions(userId: string): Promise<Submission[]> {
  const supabase = await getServerClient()
  const { data, error } = await supabase
    .from('images')
    .select('id, url, created_at, submission_id, is_anonymous_submission, contribution_credit_platform, contribution_credit_handle, crags!images_crag_id_fkey(name, slug, country_code), route_lines(count)')
    .eq('created_by', userId)
    .eq('is_anonymous_submission', false)
    .in('moderation_status', ['approved', 'skipped'])
    .not('crag_id', 'is', null)
    .not('latitude', 'is', null)
    .not('longitude', 'is', null)
    .order('created_at', { ascending: false })
    .limit(24)
  if (error) throw error
  const rows = (data || []) as PublicContributionRow[]
  const imageIds = rows.map((row) => row.id)
  if (imageIds.length === 0) return []
  const { data: links, error: linksError } = await supabase
    .from('crag_images')
    .select('source_image_id, linked_image_id')
    .or(`linked_image_id.in.(${imageIds.join(',')}),source_image_id.in.(${imageIds.join(',')})`)
  if (linksError) throw linksError
  return groupSubmittedImages(rows, (links || []) as CragImageLinkRow[])
}

export async function fetchServerPublicLogbookData(userId: string): Promise<LogbookViewModel | null> {
  const supabase = await getServerClient()
  const { data: profileData, error: profileError } = await supabase.rpc('get_visible_profile', { p_user_id: userId }).single()
  const profile = profileData as unknown as VisibleProfileRow
  if (profileError || !profileData) return null
  if (profile.is_public === false) return { user: null, userId, isOwnProfile: false, isPublic: false, logs: [], nextCursor: null, progressLogs: [], lifetimeStats: { totalClimbs: 0, totalFlashes: 0, totalTops: 0, totalTries: 0 }, profile, submissions: [], savedClimbs: [], savedCrags: [], submissionCounts: EMPTY_OWNER_SUBMISSION_COUNTS }

  const [page, stats, submissions] = await Promise.all([
    fetchServerLogbookPage(userId, 'public'),
    supabase.rpc('get_logbook_lifetime_stats', { p_user_id: userId }).single(),
    fetchPublicSubmissions(userId),
  ])
  if (stats.error) throw stats.error
  const lifetime = stats.data as LogbookLifetimeStatsRow | null
  return {
    user: null,
    userId,
    isOwnProfile: false,
    isPublic: true,
    ...page,
    progressLogs: page.progressLogs,
    lifetimeStats: { totalClimbs: lifetime?.total_climbs ?? 0, totalFlashes: lifetime?.total_flashes ?? 0, totalTops: lifetime?.total_tops ?? 0, totalTries: lifetime?.total_tries ?? 0 },
    profile,
    submissions,
    savedClimbs: [],
    savedCrags: [],
    submissionCounts: EMPTY_OWNER_SUBMISSION_COUNTS,
  }
}

async function fetchServerDrafts(supabase: Awaited<ReturnType<typeof getServerClient>>, userId: string): Promise<Submission[]> {
  const { data: draftSubmissions, error } = await supabase
    .from('submission_drafts')
    .select('id, created_at, updated_at, crags(name), submission_draft_images(id, storage_bucket, storage_path, display_order, processing_status, route_data), submission_draft_routes(id)')
    .eq('user_id', userId)
    .eq('status', 'draft')
    .order('updated_at', { ascending: false })
    .limit(24)

  if (error) throw error

  const draftRows = (draftSubmissions || []) as DraftSubmissionRow[]

  return draftRows.map((draft) => {
    const cragRelation = draft.crags
    const cragName = Array.isArray(cragRelation)
      ? (cragRelation[0]?.name || null)
      : (cragRelation?.name || null)

    const draftImages = (draft.submission_draft_images || []) as DraftPreviewImageRef[]
    const preferredImage = selectPreferredDraftPreviewImage(draftImages)

    const routeCountFromRows = Array.isArray(draft.submission_draft_routes) ? draft.submission_draft_routes.length : 0
    const routeCountFromLegacy = draftImages.reduce((count, image) => {
      const routeData = image.route_data
      if (routeData && typeof routeData === 'object' && 'completedRoutes' in (routeData as Record<string, unknown>)) {
        const completedRoutes = (routeData as { completedRoutes?: unknown[] }).completedRoutes
        return count + (Array.isArray(completedRoutes) ? completedRoutes.length : 0)
      }
      return count
    }, 0)
    const routeCount = routeCountFromRows > 0 ? routeCountFromRows : routeCountFromLegacy

    return {
      id: draft.id,
      canonical_image_id: null,
      kind: 'draft' as const,
      status: 'draft' as const,
      is_anonymous_submission: false,
      url: '',
      created_at: draft.created_at,
      updated_at: draft.updated_at,
      crag_name: cragName,
      route_lines_count: routeCount,
      image_count: draftImages.length,
      contribution_credit_platform: null,
      contribution_credit_handle: null,
      draft_preview_bucket: preferredImage?.storage_bucket || null,
      draft_preview_path: preferredImage?.storage_path || null,
    }
  })
}

async function fetchServerLogbookLogsAndProfile(userId: string) {
  const supabase = await getServerClient()
  const timing = startServerTiming('fetchServerLogbookLogsAndProfile')

  const profileRes = await timeServerStep('fetchServerLogbookLogsAndProfile', 'profile', async () =>
    getOwnProfile(supabase)
  )
  const profileData = profileRes.data
  const profileError = profileRes.error

  const [logsRes, lifetimeStatsRes] = await Promise.all([
    timeServerStep('fetchServerLogbookLogsAndProfile', 'recent-logs', async () =>
      supabase
        .from('user_climbs')
        .select(DETAILED_LOGBOOK_SELECT)
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(INITIAL_LOGBOOK_LOG_LIMIT)
    ),
    timeServerStep('fetchServerLogbookLogsAndProfile', 'lifetime-stats', async () =>
      supabase.rpc('get_logbook_lifetime_stats', { p_user_id: userId }).single()
    ),
  ])
  const logsData = logsRes.data
  const logsError = logsRes.error
  const lifetimeStatsData = lifetimeStatsRes.data as LogbookLifetimeStatsRow | null
  const lifetimeStatsError = lifetimeStatsRes.error

  if (profileError && profileError.code !== 'PGRST116') {
    throw profileError
  }

  if (logsError) {
    throw logsError
  }

  if (lifetimeStatsError) {
    throw lifetimeStatsError
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
    const cragRes = await timeServerStep('fetchServerLogbookLogsAndProfile', 'crag-meta', async () =>
      supabase.from('crags').select('id, country_code, slug').in('id', cragIds)
    )
    const cragRows = cragRes.data
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

  timing.end({
    logs: logsWithUrls.length,
    hasProfile: !!profileData,
    crags: cragMetaById.size,
  })

  return {
    supabase,
    logs: logsWithUrls,
    progressLogs: [],
    lifetimeStats: {
      totalClimbs: lifetimeStatsData?.total_climbs ?? 0,
      totalFlashes: lifetimeStatsData?.total_flashes ?? 0,
      totalTops: lifetimeStatsData?.total_tops ?? 0,
      totalTries: lifetimeStatsData?.total_tries ?? 0,
    },
    profile: (profileData || null) as LogbookProfile | null,
  }
}

export async function fetchServerLogbookSummary(user: User): Promise<ServerLogbookSummary> {
  const [{ logs, lifetimeStats, profile }, page] = await Promise.all([
    fetchServerLogbookLogsAndProfile(user.id),
    fetchServerLogbookPage(user.id, 'owner'),
  ])

  return {
    user,
    logs,
    progressLogs: page.progressLogs,
    lifetimeStats,
    profile,
  }
}

export async function fetchServerLogbookSubmissions(user: User): Promise<Submission[]> {
  const supabase = await getServerClient()

  const { data: contributionRows, error: contribError } = await supabase
    .from('images')
    .select('id, url, created_at, submission_id, moderation_status, is_anonymous_submission, contribution_credit_platform, contribution_credit_handle, crags!images_crag_id_fkey(name, slug, country_code), route_lines(count)')
    .eq('created_by', user.id)
    .or('moderation_status.eq.approved,moderation_status.eq.skipped,moderation_status.eq.pending,moderation_status.is.null')
    .order('created_at', { ascending: false })
    .limit(200)

  if (contribError) throw contribError

  let publishedSubmissions: Submission[] = []
  if (contributionRows) {
    const imageIds = (contributionRows as ContributionRow[]).map((row) => row.id)
    let links: CragImageLinkRow[] = []
    if (imageIds.length > 0) {
      const idsCsv = imageIds.join(',')
      const { data: linksData, error: linksError } = await supabase
        .from('crag_images')
        .select('source_image_id, linked_image_id')
        .or(`linked_image_id.in.(${idsCsv}),source_image_id.in.(${idsCsv})`)
      if (linksError) throw linksError
      links = (linksData || []) as CragImageLinkRow[]
    }
    publishedSubmissions = groupSubmittedImages(contributionRows as ContributionRow[], links)
  }

  const draftSubmissions = await fetchServerDrafts(supabase, user.id)

  return [...publishedSubmissions, ...draftSubmissions]
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
}

export async function fetchServerLogbookData(user: User): Promise<OwnLogbookData> {
  const timing = startServerTiming('fetchServerLogbookData')
  const [{ logs, progressLogs, nextCursor }, { lifetimeStats, profile }] = await Promise.all([
    timeServerStep('fetchServerLogbookData', 'recent-logs', () => fetchServerLogbookPage(user.id, 'owner')),
    timeServerStep('fetchServerLogbookData', 'logs-and-profile', () => fetchServerLogbookLogsAndProfile(user.id)),
  ])
  const submissions = await timeServerStep('fetchServerLogbookData', 'submissions', () => fetchServerLogbookSubmissions(user))
  const supabase = await getServerClient()
  const [savedClimbs, savedCrags] = await Promise.all([
    fetchSavedClimbs(supabase, user.id),
    fetchSavedCrags(supabase, user.id),
  ])

  timing.end({
    logs: logs.length,
    hasProfile: !!profile,
    submissions: submissions.length,
    savedClimbs: savedClimbs.length,
    savedCrags: savedCrags.length,
  })

  return {
    user,
    userId: user.id,
    isOwnProfile: true,
    isPublic: true,
    logs,
    nextCursor,
    progressLogs,
    lifetimeStats,
    profile,
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
