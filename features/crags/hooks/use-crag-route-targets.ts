'use client'

import { useEffect, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase'
import { cragKeys } from '@/features/crags/lib/crag-queries'
import { fetchRouteTargetMapsForClimbIds } from '@/features/crags/lib/crag-page-domain'
import type { CragRoute, ImageData, RouteNavigationTarget, RoutePreview } from '@/features/crags/lib/crag-page-types'

const CRAG_DEBUG_ROUTE_IDS = new Set([
  '8f450e11-55f7-40dd-b04b-e48d0061fd7b',
  '84d00fe1-44a6-48b5-b7e2-ef3205957df1',
  'e03dde44-6aef-454a-b4b1-e8237c040407',
  '1969f064-41d8-4150-b469-d09cbea993bc',
])

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
      for (const routeId of climbIds.filter((id) => CRAG_DEBUG_ROUTE_IDS.has(id))) {
        const preview = targetMaps.nextRoutePreviewByClimbId[routeId] || null
        const navigationTarget = targetMaps.nextRouteNavigationTargetByClimbId[routeId] || null
        console.log('[Crag Route Target Debug]', {
          routeId,
          imageCountInMap: imageById.size,
          routeImageIds: targetMaps.nextRouteImageIdsByClimbId[routeId] || [],
          preview,
          previewImagePresentInImageMap: preview ? imageById.has(preview.imageId) : false,
          navigationTarget,
          navigationDisplayImagePresentInImageMap: navigationTarget ? imageById.has(navigationTarget.displayImageId) : false,
        })
      }
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
