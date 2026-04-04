'use server'

import { getActionAuth } from '@/lib/actions/action-auth'
import { ok, type ActionResult } from '@/lib/actions/action-result'
import { validateActionInput } from '@/lib/actions/validate-action-input'
import { getServerClient } from '@/lib/supabase-server'
import { reportError } from '@/lib/errors'
import { z } from 'zod'

const markNotificationReadSchema = z.object({
  notificationId: z.string().trim().min(1, 'Notification ID required'),
})

export async function markNotificationReadAction(notificationId: string): Promise<ActionResult> {
  const validation = validateActionInput(markNotificationReadSchema, { notificationId })
  if (!validation.success) return validation.result

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
    .from('notifications')
    .update({ is_read: true })
    .eq('id', validation.data.notificationId)
    .eq('user_id', userId)

  if (error) {
    reportError(error, { message: 'Error marking notification as read' })
    return { success: false, error: 'Error marking notification as read', status: 500 }
  }

  return ok()
}
