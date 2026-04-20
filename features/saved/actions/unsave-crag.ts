'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getActionAuth } from '@/lib/actions/action-auth'
import { fail, ok, type ActionResult } from '@/lib/actions/action-result'
import { validateActionInput } from '@/lib/actions/validate-action-input'
import { getServerClient } from '@/lib/supabase-server'

const schema = z.object({
  cragId: z.string().trim().min(1, 'cragId is required'),
})

export async function unsaveCragAction(cragId: string): Promise<ActionResult<{ cragId: string }>> {
  const validation = validateActionInput(schema, { cragId })
  if (!validation.success) return fail(validation.result.error || 'Invalid request', validation.result.status || 400)

  const auth = await getActionAuth()
  if (!auth.success || !auth.data?.userId) {
    return { success: false, error: auth.error || 'Authentication required', status: auth.status || 401 }
  }

  const supabase = await getServerClient()
  const { error } = await supabase
    .from('saved_crags')
    .delete()
    .eq('user_id', auth.data.userId)
    .eq('crag_id', validation.data.cragId)

  if (error) return fail('Failed to unsave crag', 500)

  revalidatePath('/logbook')
  revalidatePath(`/logbook/${auth.data.userId}`)

  return ok({ cragId: validation.data.cragId })
}
