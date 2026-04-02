import { cache } from 'react'
import { getUnauthenticatedClient } from '@/lib/supabase-server'

export const getCragById = cache(async function getCragById(id: string) {
  const supabase = getUnauthenticatedClient()

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
