'use server'

import { getActionAuth } from '@/lib/actions/action-auth'
import { fetchServerLogbookPage } from '@/features/logbook/lib/queries-server'
import type { LogbookPermissionMode } from '@/features/logbook/lib/logbook-contract'

export async function loadMoreLogbookAction(
  userId: string,
  cursor: string | null,
  mode: LogbookPermissionMode,
) {
  if (mode === 'owner') {
    const auth = await getActionAuth()
    if (!auth.success || auth.data?.userId !== userId) {
      return { success: false as const, error: 'Authentication required' }
    }
  }

  try {
    return { success: true as const, ...(await fetchServerLogbookPage(userId, mode, cursor ?? undefined)) }
  } catch {
    return { success: false as const, error: 'Failed to load more logs' }
  }
}
