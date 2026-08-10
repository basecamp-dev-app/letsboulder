import type { User } from '@supabase/supabase-js'
import type { SavedClimb, SavedCrag } from '@/features/saved/public'
import type { Submission } from '@/types/submissions'
import type {
  LogbookClimb,
  LogbookLifetimeStats,
  LogbookProfile,
  ProgressLogEntry,
  OwnerSubmissionCounts,
} from '@/features/logbook/lib/logbook-view'

// Progress history is bounded to this page size on the initial response and per load-more request.
export const LOGBOOK_PAGE_SIZE = 50

export type LogbookPermissionMode = 'owner' | 'public'

export interface LogbookPage {
  logs: LogbookClimb[]
  progressLogs: ProgressLogEntry[]
  nextCursor: string | null
}

export interface LogbookViewModel extends LogbookPage {
  user: User | null
  userId: string
  isOwnProfile: boolean
  isPublic: boolean
  progressLogs: ProgressLogEntry[]
  lifetimeStats: LogbookLifetimeStats
  profile: LogbookProfile | null
  submissions: Submission[]
  savedClimbs: SavedClimb[]
  savedCrags: SavedCrag[]
  submissionCounts: OwnerSubmissionCounts
}

export const EMPTY_OWNER_SUBMISSION_COUNTS: OwnerSubmissionCounts = {
  all: 0,
  drafts: 0,
  'pending-review': 0,
  published: 0,
}
