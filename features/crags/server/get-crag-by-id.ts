import { unstable_cache } from 'next/cache'
import { cache } from 'react'
import { getCragCacheTag } from '@/features/crags/server/crag-cache-tags'
import { getUnauthenticatedClient } from '@/lib/supabase-server'

export const getCragById = cache(async function getCragById(id: string) {
  return unstable_cache(async () => {
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
  }, ['public-crag-by-id', id], {
    revalidate: 60,
    tags: [getCragCacheTag(id)],
  })()
})
