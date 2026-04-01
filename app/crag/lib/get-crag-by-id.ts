import { cache } from 'react'
import { createServerClient } from '@supabase/ssr'

export const getCragById = cache(async function getCragById(id: string) {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return [] }, setAll() {} } }
  )

  const { data: crag } = await supabase
    .from('crags')
    .select(`
      id,
      name,
      slug,
      country_code,
      region_name,
      sub_area,
      latitude,
      longitude,
      region_id,
      country_id,
      description,
      access_notes,
      rock_type,
      type,
      climbing_areas:region_id (id, name),
      countries:country_id (
        id,
        name,
        regions:region_id (
          name,
          un_regions:un_region_name (name, continent_name)
        )
      )
    `)
    .eq('id', id)
    .single()

  return crag ?? null
})
