'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getActionAuth } from '@/lib/actions/action-auth'
import { fail, ok, type ActionResult } from '@/lib/actions/action-result'
import { validateActionInput } from '@/lib/actions/validate-action-input'
import { getServerClient } from '@/lib/supabase-server'
import { resolveEffectiveClimbId } from '@/features/climb/lib/effective-climb'

const schema = z.object({
  climbId: z.string().trim().min(1, 'climbId is required'),
})

export async function saveClimbAction(climbId: string): Promise<ActionResult<{ climbId: string }>> {
  const validation = validateActionInput(schema, { climbId })
  if (!validation.success) return fail(validation.result.error || 'Invalid request', validation.result.status || 400)

  const auth = await getActionAuth()
  if (!auth.success || !auth.data?.userId) {
    return { success: false, error: auth.error || 'Authentication required', status: auth.status || 401 }
  }

  const supabase = await getServerClient()
  const effectiveClimbId = await resolveEffectiveClimbId(supabase, validation.data.climbId)
  if (!effectiveClimbId) return fail('Climb not found', 404)

  const { error } = await supabase
    .from('saved_climbs')
    .upsert({ user_id: auth.data.userId, climb_id: effectiveClimbId }, { onConflict: 'user_id,climb_id' })

  if (error) return fail('Failed to save climb', 500)

  revalidatePath('/logbook')
  revalidatePath(`/logbook/${auth.data.userId}`)

  return ok({ climbId: effectiveClimbId })
}
