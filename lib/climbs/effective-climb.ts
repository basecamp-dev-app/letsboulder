import type { Database } from '@/types/database'

type SupabaseClientLike = {
  from: (table: 'climbs') => {
    select: (query: string) => {
      eq: (column: 'id', value: string) => {
        maybeSingle: () => Promise<{
          data: Pick<Database['public']['Tables']['climbs']['Row'], 'id' | 'shared_climb_id'> | null
          error: unknown
        }>
      }
    }
  }
}

export async function resolveEffectiveClimbId(supabase: SupabaseClientLike, climbId: string) {
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
