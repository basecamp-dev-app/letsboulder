'use client'

import { useEffect, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase'
import { cragKeys } from '@/features/crags/lib/crag-queries'
import { fetchRouteTargetMapsForClimbIds } from '@/features/crags/lib/crag-page-domain'
import type { CragRoute, ImageData, RouteNavigationTarget, RoutePreview } from '@/features/crags/lib/crag-page-types'

export interface UseCragRouteTargetsParams {
  routes: CragRoute[]
  images: ImageData[]
  initialRouteTargetsComplete: boolean
  setRouteImageIdsByClimbId: (updater: (prev: Record<string, string[]>) => Record<string, string[]>) => void
  setRoutePreviewByClimbId: (updater: (prev: Record<string, RoutePreview>) => Record<string, RoutePreview>) => void
  setRouteNavigationTargetByClimbId: (updater: (prev: Record<string, RouteNavigationTarget>) => Record<string, RouteNavigationTarget>) => void
}

export function useCragRouteTargets({
  routes,
  images,
  initialRouteTargetsComplete,
  setRouteImageIdsByClimbId,
  setRoutePreviewByClimbId,
  setRouteNavigationTargetByClimbId,
}: UseCragRouteTargetsParams) {
  const climbIdsFingerprint = useMemo(() => {
    return Array.from(new Set(routes.map((route) => route.id)))
      .sort((a, b) => a.localeCompare(b))
      .join(',')
  }, [routes])

  const isOffline = typeof navigator !== 'undefined' && navigator.onLine === false

  const { data } = useQuery({
    queryKey: cragKeys.routeTargets(climbIdsFingerprint),
    queryFn: async () => {
      if (!climbIdsFingerprint) return null
      const supabase = createClient()
      const climbIds = climbIdsFingerprint.split(',').filter(Boolean)
      if (climbIds.length === 0) return null
      const imageById = new Map(images.map((image) => [image.id, image]))
      const { targetMaps } = await fetchRouteTargetMapsForClimbIds(supabase, climbIds, imageById)
      return targetMaps
    },
    enabled: !!climbIdsFingerprint && !initialRouteTargetsComplete && !isOffline,
    staleTime: 5 * 60 * 1000,
    meta: { persist: true },
  })

  useEffect(() => {
    if (!data) return
    setRouteImageIdsByClimbId(() => data.nextRouteImageIdsByClimbId)
    setRoutePreviewByClimbId((prev) => ({ ...prev, ...data.nextRoutePreviewByClimbId }))
    setRouteNavigationTargetByClimbId((prev) => ({ ...prev, ...data.nextRouteNavigationTargetByClimbId }))
  }, [data, setRouteImageIdsByClimbId, setRoutePreviewByClimbId, setRouteNavigationTargetByClimbId])
}
