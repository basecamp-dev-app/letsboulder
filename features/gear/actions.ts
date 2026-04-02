'use server'

import { type ActionResult } from '@/lib/actions/action-result'
import { getServerClient } from '@/lib/supabase-server'

export async function recordGearClickAction(productId: string): Promise<ActionResult> {
  if (!productId) {
    return { success: false, error: 'Missing productId', status: 400 }
  }

  const supabase = await getServerClient()
  const { error } = await supabase.rpc('increment_gear_click', { product_id_input: productId })

  if (error) {
    console.error('Failed to increment click count:', error)
    return { success: false, error: 'Failed to record click', status: 500 }
  }

  return { success: true }
}
