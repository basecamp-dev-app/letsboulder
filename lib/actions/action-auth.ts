import { getServerClient } from '@/lib/supabase-server'
import { fail, type ActionResult } from '@/lib/actions/action-result'

export async function getActionAuth(): Promise<ActionResult<{ userId: string }>> {
  const supabase = await getServerClient()

  try {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser()

    if (error || !user) {
      return fail('Authentication required', 401)
    }

    return {
      success: true,
      data: {
        userId: user.id,
      },
    }
  } catch {
    return fail('Authentication required', 401)
  }
}
