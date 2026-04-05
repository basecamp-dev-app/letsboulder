import type { SupabaseClient } from '@supabase/supabase-js'

const FLOOR_PLAN_SELECT = 'id, gym_place_id, name, image_url, image_width, image_height, is_active, created_at'

interface SaveFloorPlanInput {
  gymId: string
  name: string
  imageUrl: string
  imageWidth: number
  imageHeight: number
}

export async function getActiveFloorPlan(supabase: SupabaseClient, gymId: string) {
  return supabase
    .from('gym_floor_plans')
    .select(FLOOR_PLAN_SELECT)
    .eq('gym_place_id', gymId)
    .eq('is_active', true)
    .maybeSingle()
}

export async function saveFloorPlan(supabase: SupabaseClient, input: SaveFloorPlanInput) {
  const { data: gymPlace } = await supabase
    .from('places')
    .select('id, type')
    .eq('id', input.gymId)
    .eq('type', 'gym')
    .maybeSingle()

  if (!gymPlace) {
    return { floorPlan: null, error: null, notFound: true }
  }

  const { error: deactivateError } = await supabase
    .from('gym_floor_plans')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('gym_place_id', input.gymId)
    .eq('is_active', true)

  if (deactivateError) {
    return { floorPlan: null, error: deactivateError, notFound: false }
  }

  const { data: createdPlan, error: createError } = await supabase
    .from('gym_floor_plans')
    .insert({
      gym_place_id: input.gymId,
      name: input.name,
      image_url: input.imageUrl,
      image_width: input.imageWidth,
      image_height: input.imageHeight,
      is_active: true,
    })
    .select(FLOOR_PLAN_SELECT)
    .single()

  return { floorPlan: createdPlan || null, error: createError, notFound: false }
}
