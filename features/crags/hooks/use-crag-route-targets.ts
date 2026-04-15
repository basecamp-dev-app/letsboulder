'use client'

import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { runWhenIdle } from '@/lib/run-when-idle'
import { cragKeys } from '@/features/crags/lib/crag-queries'
import type { ImageRouteTarget } from '@/features/crags/lib/build-crag-image-destination'
import type { CragRoute, RouteNavigationTarget, RoutePreview } from '@/features/crags/lib/crag-page-types'
import { CRAG_ROUTE_TARGETS_PAGE_SIZE } from '@/features/crags/lib/crag-route-target-page-size'

interface RouteTargetPageResult {
  nextDefaultRouteTargetByImageId: Record<string, ImageRouteTarget>
  nextRouteImageIdsByClimbId: Record<string, string[]>
  nextRoutePreviewByClimbId: Record<string, RoutePreview>
  nextRouteNavigationTargetByClimbId: Record<string, RouteNavigationTarget>
  hasMore: boolean
}

async function fetchRouteTargetPage(cragId: string, offset: number): Promise<RouteTargetPageResult | null> {
  if (!cragId) return null

  const response = await fetch(
    `/api/crags/route-targets?cragId=${encodeURIComponent(cragId)}&limit=${CRAG_ROUTE_TARGETS_PAGE_SIZE}&offset=${offset}`,
    {
      method: 'GET',
      credentials: 'same-origin',
    }
  )

  if (!response.ok) {
    throw new Error(`Failed to fetch route targets: ${response.status}`)
  }

  const data = await response.json() as {
    defaultRouteTargetByImageId: Record<string, ImageRouteTarget>
    routeImageIdsByClimbId: Record<string, string[]>
    routePreviewByClimbId: Record<string, RoutePreview>
    routeNavigationTargetByClimbId: Record<string, RouteNavigationTarget>
    hasMore: boolean
  }

  return {
    nextDefaultRouteTargetByImageId: data.defaultRouteTargetByImageId,
    nextRouteImageIdsByClimbId: data.routeImageIdsByClimbId,
    nextRoutePreviewByClimbId: data.routePreviewByClimbId,
    nextRouteNavigationTargetByClimbId: data.routeNavigationTargetByClimbId,
    hasMore: data.hasMore,
  }
}

export interface UseCragRouteTargetsParams {
  cragId: string
  routes: CragRoute[]
  initialRouteTargetsComplete: boolean
  setDefaultRouteTargetByImageId: (updater: (prev: Record<string, ImageRouteTarget>) => Record<string, ImageRouteTarget>) => void
  setRouteImageIdsByClimbId: (updater: (prev: Record<string, string[]>) => Record<string, string[]>) => void
  setRoutePreviewByClimbId: (updater: (prev: Record<string, RoutePreview>) => Record<string, RoutePreview>) => void
  setRouteNavigationTargetByClimbId: (updater: (prev: Record<string, RouteNavigationTarget>) => Record<string, RouteNavigationTarget>) => void
}

export function useCragRouteTargets({
  cragId,
  routes,
  initialRouteTargetsComplete,
  setDefaultRouteTargetByImageId,
  setRouteImageIdsByClimbId,
  setRoutePreviewByClimbId,
  setRouteNavigationTargetByClimbId,
}: UseCragRouteTargetsParams) {
  const isOffline = typeof navigator !== 'undefined' && navigator.onLine === false
  const queryClient = useQueryClient()
  const shouldLoadFirstPage = routes.length > 0 && !initialRouteTargetsComplete && !isOffline
  const shouldPrefetchSecondPage = shouldLoadFirstPage && routes.length > CRAG_ROUTE_TARGETS_PAGE_SIZE
  const [shouldLoadSecondPage, setShouldLoadSecondPage] = useState(false)

  useEffect(() => {
    if (!shouldPrefetchSecondPage || shouldLoadSecondPage) return

    const cancel = runWhenIdle(() => {
      queryClient.prefetchQuery({
        queryKey: cragKeys.routeTargets(`${cragId}:50`),
        queryFn: () => fetchRouteTargetPage(cragId, CRAG_ROUTE_TARGETS_PAGE_SIZE),
        staleTime: 5 * 60 * 1000,
      }).then(() => {
        setShouldLoadSecondPage(true)
      }).catch(() => {
        // Keep page 1 functional if idle prefetch fails.
      })
    })

    return cancel
  }, [cragId, queryClient, shouldLoadSecondPage, shouldPrefetchSecondPage])

  const firstPageQuery = useQuery({
    queryKey: cragKeys.routeTargets(`${cragId}:0`),
    queryFn: () => fetchRouteTargetPage(cragId, 0),
    enabled: !!cragId && shouldLoadFirstPage,
    staleTime: 5 * 60 * 1000,
    meta: { persist: true },
  })

  const secondPageQuery = useQuery({
    queryKey: cragKeys.routeTargets(`${cragId}:50`),
    queryFn: () => fetchRouteTargetPage(cragId, CRAG_ROUTE_TARGETS_PAGE_SIZE),
    enabled: !!cragId && shouldLoadSecondPage,
    staleTime: 5 * 60 * 1000,
    meta: { persist: true },
  })

  useEffect(() => {
    const pages = [firstPageQuery.data, secondPageQuery.data].filter((page): page is RouteTargetPageResult => Boolean(page))
    if (pages.length === 0) return

    setDefaultRouteTargetByImageId(() => Object.assign({}, ...pages.map((page) => page.nextDefaultRouteTargetByImageId)))
    setRouteImageIdsByClimbId(() => Object.assign({}, ...pages.map((page) => page.nextRouteImageIdsByClimbId)))
    setRoutePreviewByClimbId((prev) => Object.assign({}, prev, ...pages.map((page) => page.nextRoutePreviewByClimbId)))
    setRouteNavigationTargetByClimbId((prev) => Object.assign({}, prev, ...pages.map((page) => page.nextRouteNavigationTargetByClimbId)))
  }, [
    firstPageQuery.data,
    secondPageQuery.data,
    setDefaultRouteTargetByImageId,
    setRouteImageIdsByClimbId,
    setRouteNavigationTargetByClimbId,
    setRoutePreviewByClimbId,
  ])
}
