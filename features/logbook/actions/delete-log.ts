'use server'

import { getActionAuth } from '@/lib/actions/action-auth'
import { ok, type ActionResult } from '@/lib/actions/action-result'
import { getServerClient } from '@/lib/supabase-server'
import { reportError } from '@/lib/errors'

export async function deleteLogAction(logId: string): Promise<ActionResult> {
  if (!logId) {
    return { success: false, error: 'Log ID required', status: 400 }
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
  const { error } = await supabase
    .from('user_climbs')
    .delete()
    .eq('id', logId)
    .eq('user_id', userId)

  if (error) {
    reportError(error, { message: 'Delete log error' })
    return { success: false, error: 'Delete log error', status: 500 }
  }

  return ok()
}
