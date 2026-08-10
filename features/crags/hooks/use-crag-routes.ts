'use client'

import { useQuery } from '@tanstack/react-query'
import { cragKeys, fetchCragRoutes } from '@/features/crags/lib/crag-queries'
import type { CragRoute } from '@/features/crags/lib/crag-page-types'

export type RoutesLoadState = 'idle' | 'loading' | 'loaded' | 'error'

export interface UseCragRoutesParams {
  id: string
  initialRoutes: CragRoute[] | null
}

export function useCragRoutes({
  id,
  initialRoutes,
}: UseCragRoutesParams) {
  const query = useQuery({
    queryKey: cragKeys.routes(id),
    queryFn: () => fetchCragRoutes(id),
    initialData: initialRoutes === null
      ? undefined
      : {
          routes: initialRoutes,
          effectiveClimbIdByClimbId: Object.fromEntries(initialRoutes.map((route) => [route.id, route.id])),
        },
    staleTime: 5 * 60 * 1000,
    meta: { persist: true },
  })

  return query
}
