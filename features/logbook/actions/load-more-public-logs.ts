'use server'

import { getServerClient } from '@/lib/supabase-server'
import { reportError } from '@/lib/errors'
import { z } from 'zod'
import type { LogbookClimb } from '@/features/logbook/lib/logbook-view'

const loadMoreLogsSchema = z.object({
  userId: z.string().trim().min(1, 'User ID required'),
  cursor: z.string().trim().min(1, 'Cursor required'),
})

const PAGE_SIZE = 50

export async function loadMorePublicLogsAction(
  userId: string,
  cursor: string
): Promise<{ success: true; logs: LogbookClimb[]; nextCursor: string | null } | { success: false; error: string }> {
  const validation = loadMoreLogsSchema.safeParse({ userId, cursor })
  if (!validation.success) {
    return { success: false, error: validation.error.issues[0].message }
  }

  const supabase = await getServerClient()

  const { data: profileData } = await supabase
    .from('profiles')
    .select('is_public')
    .eq('id', userId)
    .single()

  if (!profileData || profileData.is_public === false) {
    return { success: false, error: 'Profile not found or not public' }
  }

  const { data: logsData, error: logsError } = await supabase
    .from('user_climbs')
    .select('*, climbs(id, name, grade, route_lines(images(url, crags(name))))')
    .eq('user_id', userId)
    .lt('created_at', cursor)
    .order('created_at', { ascending: false })
    .limit(PAGE_SIZE)

  if (logsError) {
    reportError(logsError, { message: 'Load more public logs error' })
    return { success: false, error: 'Failed to load more logs' }
  }

  const logsWithCrags = (logsData || []).map((log) => {
    const routeLines = log.climbs?.route_lines as Array<{ images?: { url?: string; crags?: { name: string } } }> | undefined
    return {
      ...log,
      climbs: {
        ...log.climbs,
        image_url: routeLines?.[0]?.images?.url,
        crags: {
          name: routeLines?.[0]?.images?.crags?.name || 'Unknown crag'
        }
      }
    }
  }) as LogbookClimb[]

  const nextCursor = logsWithCrags.length > 0 
    ? logsWithCrags[logsWithCrags.length - 1].created_at 
    : null

  return { success: true, logs: logsWithCrags, nextCursor }
}