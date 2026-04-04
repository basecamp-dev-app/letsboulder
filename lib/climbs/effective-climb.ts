import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

export async function resolveEffectiveClimbId(supabase: SupabaseClient<Database>, climbId: string) {
  const { data, error } = await supabase
    .from('climbs')
    .select('id, shared_climb_id')
    .eq('id', climbId)
    .maybeSingle()

  if (error || !data) {
    return null
  }

  return data.shared_climb_id || data.id
}
