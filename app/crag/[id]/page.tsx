import { createServerClient } from '@supabase/ssr'
import { notFound, permanentRedirect } from 'next/navigation'
import CragPageClient from '@/app/crag/components/CragPageClient'
import { loadInitialCragRouteData } from '@/app/crag/components/crag-page-server'
import type { Crag } from '@/app/crag/components/CragPageClient'

export const revalidate = 300

export default async function CragIdPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
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

  if (!crag) notFound()

  if (crag.slug && crag.country_code) {
    permanentRedirect(`/${crag.country_code.toLowerCase()}/${crag.slug}`)
  }

  const countryRow = Array.isArray(crag.countries) ? crag.countries[0] : crag.countries
  const regionRow = Array.isArray(countryRow?.regions) ? countryRow.regions[0] : countryRow?.regions
  const unRegionRow = Array.isArray(regionRow?.un_regions) ? regionRow.un_regions[0] : regionRow?.un_regions

  const initialCrag: Crag = {
    ...crag,
    climbing_areas: Array.isArray(crag.climbing_areas) ? crag.climbing_areas[0] : crag.climbing_areas,
    country_id: crag.country_id,
    country_name: countryRow?.name,
    admin_region_name: regionRow?.name,
    un_region_name: unRegionRow?.name,
    continent_name: unRegionRow?.continent_name,
  }

  const initialRouteData = await loadInitialCragRouteData(supabase as never, id, {
    latitude: initialCrag.latitude,
    longitude: initialCrag.longitude,
  })

  return (
    <CragPageClient
      id={id}
      initialCrag={initialCrag}
      initialImages={initialRouteData.initialImages}
      initialRoutes={initialRouteData.initialRoutes}
      initialRouteImageIdsByClimbId={initialRouteData.initialRouteImageIdsByClimbId}
      initialRoutePreviewByClimbId={initialRouteData.initialRoutePreviewByClimbId}
      initialCragCenter={initialRouteData.initialCragCenter}
    />
  )
}
