import { createServerClient } from '@supabase/ssr'
import { notFound, permanentRedirect } from 'next/navigation'
import CragPageClient from '@/features/crags/components/CragPageClient'
import { loadInitialCragRouteData } from '@/features/crags/server/load-initial-crag-route-data'
import { getCragById } from '../lib/get-crag-by-id'
import type { Crag } from '@/features/crags/lib/crag-page-types'
import { serverEnv } from '@/lib/env'

export const revalidate = 300

export default async function CragIdPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const crag = await getCragById(id)

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

  const supabase = createServerClient(
    serverEnv.NEXT_PUBLIC_SUPABASE_URL,
    serverEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { cookies: { getAll() { return [] }, setAll() {} } }
  )
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
