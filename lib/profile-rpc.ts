import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js'

import type { Database } from '@/types/database'

type ProfileRow = Database['public']['Tables']['profiles']['Row']

type ProfileRpcClient = {
  rpc: (fn: 'get_own_profile') => PromiseLike<{
    data: ProfileRow | ProfileRow[] | null
    error: PostgrestError | null
  }>
}

type AdminRpcClient = {
  rpc: (fn: 'is_current_user_admin') => PromiseLike<{
    data: boolean | null
    error: PostgrestError | null
  }>
}

export async function getOwnProfile(supabase: SupabaseClient<Database>) {
  const result = await (supabase as unknown as ProfileRpcClient).rpc('get_own_profile')
  return {
    data: Array.isArray(result.data) ? result.data[0] || null : result.data,
    error: result.error,
  }
}

export function isCurrentUserAdmin(supabase: SupabaseClient<Database>) {
  return (supabase as unknown as AdminRpcClient).rpc('is_current_user_admin')
}
