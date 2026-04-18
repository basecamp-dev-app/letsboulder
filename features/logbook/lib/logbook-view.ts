import { calculateStats, getLowestGrade, type LogEntry } from '@/lib/grades'
import type { OwnLogbookData } from '@/features/logbook/lib/queries'
import type { Submission } from '@/types/submissions'

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

export interface LogbookProfile {
  id: string
  username: string
  display_name?: string
  avatar_url?: string
  bio?: string
  total_climbs?: number
  total_points?: number
  highest_grade?: string
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

export function getLogbookStats(logs: LogbookClimb[]): LogbookStats | null {
  if (logs.length === 0) return null
  return calculateStats(logs)
}

export function getLogbookLowestGrade(stats: LogbookStats | null): string {
  return stats ? getLowestGrade(stats.gradePyramid) : '6A'
}

export function getRecentLogbookLogs(logs: LogbookClimb[]): LogbookClimb[] {
  return logs.slice(0, 20)
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

export function replaceOwnLogbookLogs(current: OwnLogbookData, nextLogs: LogbookClimb[]): OwnLogbookData {
  return {
    ...current,
    logs: nextLogs,
  }
}

export function replaceOwnLogbookSubmissions(current: OwnLogbookData, nextSubmissions: Submission[]): OwnLogbookData {
  return {
    ...current,
    submissions: nextSubmissions,
  }
}

export type { LogEntry }
