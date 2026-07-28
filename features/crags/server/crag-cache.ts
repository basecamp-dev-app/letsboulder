import { unstable_cache } from 'next/cache'
import { getUnauthenticatedClient } from '@/lib/supabase-server'
import { loadInitialCragRouteData } from '@/features/crags/server/load-initial-crag-route-data'
import { getCragCacheTag } from '@/features/crags/server/crag-cache-tags'

const PUBLIC_CRAG_REVALIDATE_SECONDS = 60

export function getCachedInitialCragRouteData(
  cragId: string,
  cragCoords: { latitude: number | null; longitude: number | null },
) {
  return unstable_cache(
    () => loadInitialCragRouteData(getUnauthenticatedClient(), cragId, cragCoords),
    ['public-crag-route-data', cragId, String(cragCoords.latitude), String(cragCoords.longitude)],
    {
      revalidate: PUBLIC_CRAG_REVALIDATE_SECONDS,
      tags: [getCragCacheTag(cragId)],
    },
  )()
}
