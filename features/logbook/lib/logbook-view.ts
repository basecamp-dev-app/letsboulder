import { calculateStats, getLowestGrade, type LogEntry } from '@/lib/grades'
import type { LogbookViewModel } from '@/features/logbook/lib/logbook-contract'
import type { Submission } from '@/types/submissions'
import type { SavedClimb, SavedCrag } from '@/features/saved/public'

export interface LogbookClimb {
  id: string
  climb_id: string
  style: string
  created_at: string
  points?: number
  notes?: string
  date_climbed?: string | null
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

export interface ProgressLogEntry {
  id: string
  climb_id: string
  style: string
  created_at: string
  date_climbed?: string | null
  climbs?: {
    id?: string
    name: string | null
    grade: string
  } | null
}

export interface LogbookLifetimeStats {
  totalClimbs: number
  totalFlashes: number
  totalTops: number
  totalTries: number
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
  contributor_score_total?: number
  accepted_contribution_count?: number
  contributor_tier?: string | null
  first_name?: string
  last_name?: string
}

export type OwnerSubmissionsTab = 'all' | 'drafts' | 'pending-review' | 'published'

export interface OwnerSubmissionTabOption {
  id: OwnerSubmissionsTab
  label: string
}

export interface OwnerSubmissionCounts {
  all: number
  drafts: number
  'pending-review': number
  published: number
}

export type LogbookStats = ReturnType<typeof calculateStats>

export const ownerSubmissionTabs: OwnerSubmissionTabOption[] = [
  { id: 'all', label: 'All' },
  { id: 'drafts', label: 'Drafts' },
  { id: 'pending-review', label: 'Pending review' },
  { id: 'published', label: 'Published' },
]

export const statusStyles: Record<string, string> = {
  flash: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200',
  top: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200',
  try: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-200',
}

export function getLogbookStats(
  logs: LogEntry[],
  lifetimeStats?: LogbookLifetimeStats,
): LogbookStats | null {
  if (logs.length === 0 && !lifetimeStats?.totalClimbs) return null

  const stats = calculateStats(logs)
  if (!lifetimeStats) return stats

  return {
    ...stats,
    totalClimbs: lifetimeStats.totalClimbs,
    totalFlashes: lifetimeStats.totalFlashes,
    totalTops: lifetimeStats.totalTops,
    totalTries: lifetimeStats.totalTries,
  }
}

export function getLogbookLowestGrade(stats: LogbookStats | null): string {
  return stats ? getLowestGrade(stats.gradePyramid) : '6A'
}

export function getRecentLogbookLogs(logs: LogbookClimb[]): LogbookClimb[] {
  return logs
}

export function getOwnerSubmissionCounts(submissions: Submission[]): OwnerSubmissionCounts {
  return {
    all: submissions.length,
    drafts: submissions.filter((submission) => submission.status === 'draft').length,
    'pending-review': submissions.filter((submission) => submission.status === 'pending_review').length,
    published: submissions.filter((submission) => submission.status === 'published').length,
  }
}

export function getVisibleOwnerSubmissions(
  submissions: Submission[],
  tab: OwnerSubmissionsTab,
): Submission[] {
  if (tab === 'drafts') {
    return submissions.filter((submission) => submission.status === 'draft')
  }

  if (tab === 'pending-review') {
    return submissions.filter((submission) => submission.status === 'pending_review')
  }

  if (tab === 'published') {
    return submissions.filter((submission) => submission.status === 'published')
  }

  return submissions
}

export function getOwnerSubmissionEmptyMessage(tab: OwnerSubmissionsTab): string {
  if (tab === 'drafts') return 'No drafts yet.'
  if (tab === 'pending-review') return 'No submissions pending review.'
  if (tab === 'published') return 'No published submissions yet.'
  return 'No submissions yet.'
}

export function normalizeOwnerSubmissionsTab(value: string | null | undefined): OwnerSubmissionsTab {
  if (value === 'drafts' || value === 'published' || value === 'pending-review') return value
  return 'all'
}

export function replaceOwnLogbookLogs(current: LogbookViewModel, nextLogs: LogbookClimb[]): LogbookViewModel {
  return {
    ...current,
    logs: nextLogs,
  }
}

export function replaceOwnLogbookSubmissions(current: LogbookViewModel, nextSubmissions: Submission[]): LogbookViewModel {
  return {
    ...current,
    submissionCounts: getOwnerSubmissionCounts(nextSubmissions),
  }
}

export function replaceOwnSavedClimbs(current: LogbookViewModel, nextSavedClimbs: SavedClimb[]): LogbookViewModel {
  return {
    ...current,
    savedClimbs: nextSavedClimbs,
  }
}

export function replaceOwnSavedCrags(current: LogbookViewModel, nextSavedCrags: SavedCrag[]): LogbookViewModel {
  return {
    ...current,
    savedCrags: nextSavedCrags,
  }
}

export type { LogEntry }
