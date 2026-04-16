'use server'

import { getActionAuth } from '@/lib/actions/action-auth'
import { fail, ok, type ActionResult } from '@/lib/actions/action-result'
import { validateActionInput } from '@/lib/actions/validate-action-input'
import { resolveEffectiveClimbId } from '@/features/climb/lib/effective-climb'
import { getServerClient } from '@/lib/supabase-server'
import { reportError } from '@/lib/errors'
import { z } from 'zod'

type LogStyle = 'flash' | 'top' | 'try'

const logRoutesSchema = z.object({
  climbIds: z.array(z.string().trim().min(1)).min(1, 'climbIds array is required'),
  style: z.enum(['flash', 'top', 'try'], { error: 'Invalid style' }).default('top'),
  notes: z.string().trim().max(500, 'Notes must be under 500 characters').optional(),
})

interface LogRoutesResult {
  logged: number
  style: LogStyle
}

export async function logRoutesAction(
  climbIds: string[],
  style: LogStyle = 'top',
  notes?: string
): Promise<ActionResult<LogRoutesResult>> {
  const validation = validateActionInput(logRoutesSchema, { climbIds, style, notes })
  if (!validation.success) return fail<LogRoutesResult>(validation.result.error || 'Invalid request data', validation.result.status || 400)

  const auth = await getActionAuth()
  if (!auth.success) {
    return { success: false, error: auth.error, status: auth.status }
  }

  if (!auth.data?.userId) {
    return { success: false, error: 'Authentication required', status: 401 }
  }

  const userId = auth.data.userId
  const { climbIds: validatedClimbIds, style: validatedStyle } = validation.data

  const supabase = await getServerClient()
  const effectiveClimbIds = Array.from(
    new Set(
      (await Promise.all(validatedClimbIds.map((climbId) => resolveEffectiveClimbId(supabase as never, climbId)))).filter(
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
    style: validatedStyle,
    date_climbed: now.toISOString().split('T')[0],
    created_at: now.toISOString(),
    notes: validation.data.notes || null,
  }))

  const { error } = await supabase
    .from('user_climbs')
    .upsert(logs, { onConflict: 'user_id,climb_id' })

  if (error) {
    reportError(error, { message: 'Failed to log climbs' })
    return { success: false, error: 'Failed to log climbs', status: 500 }
  }

  return ok({
    logged: effectiveClimbIds.length,
    style: validatedStyle,
  })
}
