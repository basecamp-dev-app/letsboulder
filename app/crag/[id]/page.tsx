import { notFound, permanentRedirect } from 'next/navigation'
import CragPageShell from '@/features/crags/components/CragPageShell'
import type { CommunityPlaceInfo } from '@/features/crags/components/CragCommunitySidebar'
import { getCachedInitialCragRouteData } from '@/features/crags/server/crag-cache'
import { getUnauthenticatedClient } from '@/lib/supabase-server'
import { getCragById } from '@/features/crags/server/get-crag-by-id'
import type { CragPageCrag } from '@/features/crags/lib/crag-page-types'

export const revalidate = 60

export function generateStaticParams() {
  return []
}

async function getCommunityPlaceById(id: string): Promise<CommunityPlaceInfo | null> {
  const supabase = getUnauthenticatedClient()
  const { data } = await supabase
    .from('places')
    .select('slug, type')
    .eq('id', id)
    .maybeSingle<{ slug: string | null; type: string | null }>()

  if (!data?.slug || (data.type !== 'crag' && data.type !== 'gym')) {
    return null
  }

  return {
    slug: data.slug,
    type: data.type,
  }
}

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

  const initialCrag: CragPageCrag = {
    ...crag,
    climbing_areas: Array.isArray(crag.climbing_areas) ? crag.climbing_areas[0] : crag.climbing_areas,
    country_id: crag.country_id,
    country_name: countryRow?.name,
    admin_region_name: regionRow?.name,
    un_region_name: unRegionRow?.name,
    continent_name: unRegionRow?.continent_name,
  }

  const initialRouteData = await getCachedInitialCragRouteData(id, {
    latitude: initialCrag.latitude,
    longitude: initialCrag.longitude,
  })
  const communityPlace = await getCommunityPlaceById(id)

  return (
    <CragPageShell
      id={id}
      initialCrag={initialCrag}
      initialImages={initialRouteData.initialImages}
      initialRoutes={initialRouteData.initialRoutes}
      initialRouteImageIdsByClimbId={initialRouteData.initialRouteImageIdsByClimbId}
      initialRoutePreviewByClimbId={initialRouteData.initialRoutePreviewByClimbId}
      initialDefaultRouteTargetByImageId={initialRouteData.initialDefaultRouteTargetByImageId}
      initialRouteNavigationTargetByClimbId={initialRouteData.initialRouteNavigationTargetByClimbId}
      initialCragCenter={initialRouteData.initialCragCenter}
      initialRouteTargetsComplete={initialRouteData.initialRouteTargetsComplete}
      initialCriticalImagesComplete={initialRouteData.initialCriticalImagesComplete}
      initialMapImagesComplete={initialRouteData.initialMapImagesComplete}
      initialPayloadLoadedAt={initialRouteData.loadedAt}
      communityPlace={communityPlace}
    />
  )
}
