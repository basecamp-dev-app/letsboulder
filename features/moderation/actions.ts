'use server'

import { type ActionResult } from '@/lib/actions/action-result'
import { getActionAuth } from '@/lib/actions/action-auth'
import { validateActionInput } from '@/lib/actions/validate-action-input'
import { notifyNewFlag } from '@/lib/discord'
import { createFlag } from '@/features/moderation/lib/create-flag'
import { getServerClient } from '@/lib/supabase-server'
import { reportError } from '@/lib/errors'
import { isCurrentUserAdmin } from '@/lib/profile-rpc'
import { z } from 'zod'

const VALID_FLAG_TYPES = ['location', 'route_line', 'route_name', 'image_quality', 'wrong_crag', 'other']
const MAX_COMMENT_LENGTH = 250
const DEFAULT_FLAG_TYPE = 'other'
const DEFAULT_COMMENT = 'Flagged for admin review'

const submitFlagSchema = z.object({
  targetId: z.string().trim().min(1),
  flagType: z.enum(VALID_FLAG_TYPES as [string, ...string[]], {
    error: `Invalid flag type. Must be one of: ${VALID_FLAG_TYPES.join(', ')}`,
  }),
  comment: z.string().trim().min(10, 'Comment must be at least 10 characters').max(MAX_COMMENT_LENGTH, `Comment must be ${MAX_COMMENT_LENGTH} characters or less`),
})

const submitCragFlagSchema = z.object({
  cragId: z.string().trim().min(1, 'Crag ID required'),
})

export async function submitClimbFlagAction(climbId: string, flagType: string, comment: string): Promise<ActionResult> {
  const validation = validateActionInput(submitFlagSchema, { targetId: climbId, flagType, comment })
  if (!validation.success) return validation.result

  const auth = await getActionAuth()
  if (!auth.success) return { success: false, error: auth.error, status: auth.status }
  if (!auth.data?.userId) return { success: false, error: 'Authentication required', status: 401 }
  const { targetId, flagType: validatedFlagType, comment: trimmedComment } = validation.data

  const supabase = await getServerClient()
  const { data: climb, error: climbError } = await supabase
    .from('climbs')
    .select('id, name, grade, crag_id, user_id, deleted_at, crag:crag_id(id, name)')
    .eq('id', targetId)
    .single()

  if (climbError || !climb) return { success: false, error: 'Climb not found', status: 404 }
  if (climb.deleted_at) return { success: false, error: 'This climb has already been removed', status: 400 }

  const flagResult = await createFlag({
    supabase,
    userId: auth.data.userId,
    climbId: targetId,
    cragId: climb.crag_id,
    flagType: validatedFlagType,
    comment: trimmedComment,
  })

  if (flagResult.error) return { success: false, error: 'Error checking existing flag', status: 500 }
  if (flagResult.duplicate) return { success: false, error: 'You have already flagged this climb. It is being reviewed.', status: 400 }

  const cragName = climb.crag?.name || 'Unknown Crag'
  if (climb.crag_id) {
    await notifyNewFlag(supabase, {
      type: 'climb',
      flagType: validatedFlagType,
      targetName: climb.name ?? undefined,
      cragName,
      cragId: climb.crag_id,
      comment: trimmedComment,
      flaggerId: auth.data.userId,
    }).catch(err => reportError(err, { message: 'Discord notification error' }))
  }

  return { success: true }
}

export async function submitCragFlagAction(cragId: string): Promise<ActionResult> {
  const validation = validateActionInput(submitCragFlagSchema, { cragId })
  if (!validation.success) return validation.result

  const auth = await getActionAuth()
  if (!auth.success) return { success: false, error: auth.error, status: auth.status }
  if (!auth.data?.userId) return { success: false, error: 'Authentication required', status: 401 }

  const supabase = await getServerClient()
  const { data: isAdmin, error: profileError } = await isCurrentUserAdmin(supabase)
  if (profileError || !isAdmin) return { success: false, error: 'Admin access required to flag crags', status: 403 }

  const { data: crag, error: cragError } = await supabase.from('crags').select('id, name').eq('id', validation.data.cragId).single()
  if (cragError || !crag) return { success: false, error: 'Crag not found', status: 404 }

  const flagResult = await createFlag({
    supabase,
    userId: auth.data.userId,
    cragId: validation.data.cragId,
    flagType: DEFAULT_FLAG_TYPE,
    comment: DEFAULT_COMMENT,
  })

  if (flagResult.error) return { success: false, error: 'Error checking existing flag', status: 500 }
  if (flagResult.duplicate) return { success: false, error: 'You have already flagged this crag. It is being reviewed.', status: 400 }

  await notifyNewFlag(supabase, {
    type: 'crag',
    flagType: DEFAULT_FLAG_TYPE,
    cragName: crag.name,
    cragId: crag.id,
    comment: DEFAULT_COMMENT,
    flaggerId: auth.data.userId,
  }).catch(err => reportError(err, { message: 'Discord notification error' }))

  return { success: true }
}
