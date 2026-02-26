import { supabaseAdmin } from './supabase-admin'

export async function cleanupE2ERoutesByPrefix(prefix: string = 'E2E Route'): Promise<void> {
  const { data: climbs, error: climbsQueryError } = await supabaseAdmin
    .from('climbs')
    .select('id')
    .ilike('name', `${prefix}%`)

  if (climbsQueryError) {
    throw new Error(`Failed to query E2E routes for cleanup: ${climbsQueryError.message}`)
  }

  if (!climbs || climbs.length === 0) return

  const climbIds = climbs.map((climb) => climb.id)

  const { error: routeLinesDeleteError } = await supabaseAdmin
    .from('route_lines')
    .delete()
    .in('climb_id', climbIds)

  if (routeLinesDeleteError) {
    throw new Error(`Failed to delete E2E route lines: ${routeLinesDeleteError.message}`)
  }

  const { error: climbsDeleteError } = await supabaseAdmin
    .from('climbs')
    .delete()
    .in('id', climbIds)

  if (climbsDeleteError) {
    throw new Error(`Failed to delete E2E climbs: ${climbsDeleteError.message}`)
  }
}
