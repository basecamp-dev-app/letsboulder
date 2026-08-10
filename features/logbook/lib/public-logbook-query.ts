import type { InfiniteData } from '@tanstack/react-query'
import type { LogbookClimb } from '@/features/logbook/lib/logbook-view'
import type { LogbookPage } from '@/features/logbook/lib/logbook-contract'
import type { LogbookLifetimeStats, LogbookProfile, ProgressLogEntry } from '@/features/logbook/lib/logbook-view'
import type { Submission } from '@/types/submissions'

export interface PublicLogbookPageData extends LogbookPage {
  progressLogs?: ProgressLogEntry[]
  lifetimeStats?: LogbookLifetimeStats
  profile?: LogbookProfile | null
  submissions?: Submission[]
}

export function publicLogbookQueryKey(userId: string) {
  return ['logbook', 'public', userId] as const
}

export function flattenPublicLogbookPages(data: InfiniteData<PublicLogbookPageData> | undefined): LogbookClimb[] {
  if (!data) return []
  return data.pages.flatMap((page) => page.logs)
}
