'use server'

import { getActionAuth } from '@/lib/actions/action-auth'
import { ok, type ActionResult } from '@/lib/actions/action-result'
import { getServerClient } from '@/lib/supabase-server'

export async function markNotificationReadAction(notificationId: string): Promise<ActionResult> {
  if (!notificationId) {
    return { success: false, error: 'Notification ID required', status: 400 }
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
    .from('notifications')
    .update({ is_read: true })
    .eq('id', notificationId)
    .eq('user_id', userId)

  if (error) {
    console.error('Error marking notification as read:', error)
    return { success: false, error: 'Error marking notification as read', status: 500 }
  }

  return ok()
}
