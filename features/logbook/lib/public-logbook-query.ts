import type { InfiniteData } from '@tanstack/react-query'
import type { LogbookClimb, LogbookLifetimeStats, LogbookProfile, ProgressLogEntry } from '@/features/logbook/lib/logbook-view'
import type { Submission } from '@/types/submissions'

export interface PublicLogbookPageData {
  logs: LogbookClimb[]
  progressLogs?: ProgressLogEntry[]
  lifetimeStats?: LogbookLifetimeStats
  nextCursor: string | null
  profile?: LogbookProfile
  submissions?: Submission[]
}

export function publicLogbookQueryKey(userId: string) {
  return ['logbook', 'public', userId] as const
}

export function flattenPublicLogbookPages(data: InfiniteData<PublicLogbookPageData> | undefined): LogbookClimb[] {
  if (!data) return []
  return data.pages.flatMap((page) => page.logs)
}
