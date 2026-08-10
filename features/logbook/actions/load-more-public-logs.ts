'use server'

import { reportError } from '@/lib/errors'
import { z } from 'zod'
import { loadMoreLogbookAction } from '@/features/logbook/actions/load-more-logbook'
import type { LogbookClimb, ProgressLogEntry } from '@/features/logbook/lib/logbook-view'

const loadMoreLogsSchema = z.object({
  userId: z.string().trim().min(1, 'User ID required'),
  cursor: z.string().trim().min(1, 'Cursor required').nullable(),
})

export async function loadMorePublicLogsAction(
  userId: string,
  cursor: string | null
): Promise<{ success: true; logs: LogbookClimb[]; progressLogs: ProgressLogEntry[]; nextCursor: string | null } | { success: false; error: string }> {
  const validation = loadMoreLogsSchema.safeParse({ userId, cursor })
  if (!validation.success) {
    return { success: false, error: validation.error.issues[0].message }
  }

  try {
    const result = await loadMoreLogbookAction(userId, cursor, 'public')
    if (!result.success) return result
    return result
  } catch (error) {
    reportError(error, { message: 'Load more public logs error' })
    return { success: false, error: 'Failed to load more logs' }
  }
}
