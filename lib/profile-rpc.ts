import type { SupabaseClient } from '@supabase/supabase-js'

import type { Database } from '@/types/database'

export async function getOwnProfile(supabase: SupabaseClient<Database>) {
  const result = await supabase.rpc('get_own_profile')
  return {
    data: result.data?.[0] ?? null,
    error: result.error,
  }
}

export function isCurrentUserAdmin(supabase: SupabaseClient<Database>) {
  return supabase.rpc('is_current_user_admin')
}
