'use server'

import { getActionAuth } from '@/lib/actions/action-auth'
import { ok, type ActionResult } from '@/lib/actions/action-result'
import { resolveEffectiveClimbId } from '@/lib/climbs/effective-climb'
import { getServerClient } from '@/lib/supabase-server'

type LogStyle = 'flash' | 'top' | 'try'

interface LogRoutesResult {
  logged: number
  style: LogStyle
}

export async function logRoutesAction(
  climbIds: string[],
  style: LogStyle = 'top'
): Promise<ActionResult<LogRoutesResult>> {
  if (!Array.isArray(climbIds) || climbIds.length === 0) {
    return { success: false, error: 'climbIds array is required', status: 400 }
  }

  if (!['flash', 'top', 'try'].includes(style)) {
    return { success: false, error: 'Invalid style', status: 400 }
  }

  const auth = await getActionAuth()
  if (!auth.success) {
    return { success: false, error: auth.error, status: auth.status }
  }

  if (!auth.data?.userId) {
    return { success: false, error: 'Authentication required', status: 401 }
  }

  const userId = auth.data.userId

  const supabase = await getServerClient()
  const effectiveClimbIds = Array.from(
    new Set(
      (await Promise.all(climbIds.map((climbId) => resolveEffectiveClimbId(supabase as never, climbId)))).filter(
        (climbId): climbId is string => typeof climbId === 'string'
      )
    )
  )

  if (effectiveClimbIds.length === 0) {
    return { success: false, error: 'No valid climbs found', status: 404 }
  }

  const now = new Date()
  const logs = effectiveClimbIds.map((climbId) => ({
    user_id: userId,
    climb_id: climbId,
    style,
    date_climbed: now.toISOString().split('T')[0],
    created_at: now.toISOString(),
  }))

  const { error } = await supabase
    .from('user_climbs')
    .upsert(logs, { onConflict: 'user_id,climb_id' })

  if (error) {
    console.error('Failed to log climbs:', error)
    return { success: false, error: 'Failed to log climbs', status: 500 }
  }

  return ok({
    logged: effectiveClimbIds.length,
    style,
  })
}
