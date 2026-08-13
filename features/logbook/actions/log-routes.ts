'use server'

import type { PostgrestError } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getActionAuth } from '@/lib/actions/action-auth'
import { fail, ok, type ActionResult } from '@/lib/actions/action-result'
import { validateActionInput } from '@/lib/actions/validate-action-input'
import { resolveEffectiveClimbId } from '@/features/climb/public-client'
import { getServerClient } from '@/lib/supabase-server'
import { reportError } from '@/lib/errors'
import type { Json } from '@/types/database'

type LogStyle = 'flash' | 'top' | 'try'

const logRoutesSchema = z.object({
  climbIds: z.array(z.string().trim().min(1)).min(1, 'climbIds array is required'),
  style: z.enum(['flash', 'top', 'try'], { error: 'Invalid style' }).default('top'),
  notes: z.string().trim().max(500, 'Notes must be under 500 characters').optional(),
  climbedOn: z.iso.date({ error: 'Invalid climbed date' }),
  mutationId: z.uuid('Mutation ID is required'),
  createdAt: z.iso.datetime({ error: 'Invalid mutation creation time' }),
})

interface LogRoutesResult {
  logged: number
  style: LogStyle
}

type LogRoutesRpc = (fn: 'log_routes_idempotent', args: {
  p_climb_ids: string[]
  p_climbed_on: string
  p_created_at: string
  p_mutation_id: string
  p_notes: string | null
  p_style: string
}) => PromiseLike<{ data: Json | null; error: PostgrestError | null }>

function isLogStyle(value: unknown): value is LogStyle {
  return value === 'flash' || value === 'top' || value === 'try'
}

export async function logRoutesAction(
  climbIds: string[],
  style: LogStyle = 'top',
  notes: string | undefined,
  climbedOn: string,
  mutationId: string,
  createdAt: string,
): Promise<ActionResult<LogRoutesResult>> {
  const validation = validateActionInput(logRoutesSchema, { climbIds, style, notes, climbedOn, mutationId, createdAt })
  if (!validation.success) return fail<LogRoutesResult>(validation.result.error || 'Invalid request data', validation.result.status || 400)

  const auth = await getActionAuth()
  if (!auth.success) {
    return { success: false, error: auth.error, status: auth.status }
  }

  if (!auth.data?.userId) {
    return { success: false, error: 'Authentication required', status: 401 }
  }

  const userId = auth.data.userId
  const { climbedOn: validatedClimbedOn, climbIds: validatedClimbIds, style: validatedStyle, mutationId: validatedMutationId, createdAt: validatedCreatedAt } = validation.data

  const supabase = await getServerClient()
  const effectiveClimbIds = Array.from(
    new Set(
      (await Promise.all(validatedClimbIds.map((climbId) => resolveEffectiveClimbId(supabase, climbId)))).filter(
        (climbId): climbId is string => typeof climbId === 'string'
      )
    )
  )

  if (effectiveClimbIds.length === 0) {
    return { success: false, error: 'No valid climbs found', status: 404 }
  }

  const { data, error } = await (supabase.rpc as LogRoutesRpc)('log_routes_idempotent', {
    p_mutation_id: validatedMutationId,
    p_climb_ids: effectiveClimbIds,
    p_style: validatedStyle,
    p_notes: validation.data.notes || null,
    p_climbed_on: validatedClimbedOn,
    p_created_at: validatedCreatedAt,
  })

  if (error) {
    reportError(error, { message: 'Failed to log climbs' })
    if (error.code === '22023' && error.details === 'mutation_id_conflict') {
      return { success: false, error: 'Mutation ID was already used for a different request', status: 409 }
    }
    return { success: false, error: 'Failed to log climbs', status: 500 }
  }

  revalidatePath('/logbook')
  revalidatePath(`/logbook/${userId}`)

  const result = data !== null && typeof data === 'object' && !Array.isArray(data) ? data : null
  return ok({
    logged: typeof result?.logged === 'number' ? result.logged : 0,
    style: isLogStyle(result?.style) ? result.style : validatedStyle,
  })
}
