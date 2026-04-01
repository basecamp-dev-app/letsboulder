'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { resolveRouteImageUrl } from '@/lib/media/route-image-url'
import { buildSelectableImageIdByImageId } from '@/lib/image-identity'
import type { ClimbPackResponse } from '@/lib/climb/queries'
import type { ImageRouteTarget } from '@/features/crags/lib/build-crag-image-destination'
import { dedupeCragRoutes, fetchRouteTargetMapsForClimbIds, formatCragRoutes, getAverageCoordinates, getStoredCragClimbPayloadsSafely, hasCompleteRouteTargets, hydrateOfflineCragData, remapRouteNavigationTargetsByEffectiveClimbId, remapRoutePreviewsByEffectiveClimbId } from '@/features/crags/lib/crag-page-domain'
import type { CachedCragImageData, CragRouteIntelligenceRow, RawImageRow } from '@/features/crags/lib/crag-page-domain'
import type { Crag, CragRoute, ImageData, RouteNavigationTarget, RoutePreview } from '@/features/crags/lib/crag-page-types'

const CRAG_IMAGE_CACHE_TTL_MS = 5 * 60 * 1000
const cragImageCache = new Map<string, CachedCragImageData>()

function getFreshCachedCragData(id: string) {
  const cached = cragImageCache.get(id)
  if (!cached) return null
  return Date.now() - cached.cachedAt <= CRAG_IMAGE_CACHE_TTL_MS ? cached : null
}

function isOfflineDocumentNavigationPreferred() {
  return typeof navigator !== 'undefined' && navigator.onLine === false
}

export interface UseCragDataParams {
  id: string
  initialCrag?: Crag | null
  initialImages?: ImageData[]
  initialRoutes?: CragRoute[] | null
  initialRouteImageIdsByClimbId?: Record<string, string[]>
  initialRoutePreviewByClimbId?: Record<string, RoutePreview>
  initialDefaultRouteTargetByImageId?: Record<string, ImageRouteTarget>
  initialRouteNavigationTargetByClimbId?: Record<string, RouteNavigationTarget>
  initialCragCenter?: [number, number] | null
  initialPayloadLoadedAt?: number
}

export interface UseCragDataResult {
  crag: Crag | null
  images: ImageData[]
  routes: CragRoute[]
  routeImageIdsByClimbId: Record<string, string[]>
  routePreviewByClimbId: Record<string, RoutePreview>
  routeNavigationTargetByClimbId: Record<string, RouteNavigationTarget>
  defaultRouteTargetByImageId: Record<string, ImageRouteTarget>
  routesLoadState: 'idle' | 'loading' | 'loaded' | 'error'
  loading: boolean
  cragCenter: [number, number] | null
}

export function useCragData({
  id,
  initialCrag = null,
  initialImages = [],
  initialRoutes = null,
  initialRouteImageIdsByClimbId = {},
  initialRoutePreviewByClimbId = {},
  initialDefaultRouteTargetByImageId = {},
  initialRouteNavigationTargetByClimbId = {},
  initialCragCenter = null,
  initialPayloadLoadedAt,
}: UseCragDataParams): UseCragDataResult {
  const [crag, setCrag] = useState<Crag | null>(initialCrag)
  const hasInitialRouteData = initialRoutes !== null
  const [images, setImages] = useState<ImageData[]>(initialImages)
  const [routes, setRoutes] = useState<CragRoute[]>(initialRoutes || [])
  const [routeImageIdsByClimbId, setRouteImageIdsByClimbId] = useState<Record<string, string[]>>(initialRouteImageIdsByClimbId)
  const [routePreviewByClimbId, setRoutePreviewByClimbId] = useState<Record<string, RoutePreview>>(initialRoutePreviewByClimbId)
  const [routesLoadState, setRoutesLoadState] = useState<'idle' | 'loading' | 'loaded' | 'error'>(hasInitialRouteData ? 'loaded' : 'idle')
  const [cragCenter, setCragCenter] = useState<[number, number] | null>(initialCragCenter)
  const [loading, setLoading] = useState(!initialCrag)
  const [defaultRouteTargetByImageId, setDefaultRouteTargetByImageId] = useState<Record<string, ImageRouteTarget>>(initialDefaultRouteTargetByImageId)
  const [routeNavigationTargetByClimbId, setRouteNavigationTargetByClimbId] = useState<Record<string, RouteNavigationTarget>>(initialRouteNavigationTargetByClimbId)

  const initialRouteSource = useMemo(() => initialRoutes || [], [initialRoutes])
  // eslint-disable-next-line react-hooks/purity -- one-time mount timestamp for cache freshness check
  const mountTimestamp = Date.now()
  const hasFreshInitialPayload = useMemo(() => {
    if (!initialCrag || initialImages.length === 0 || !initialPayloadLoadedAt) return false
    return mountTimestamp - initialPayloadLoadedAt <= CRAG_IMAGE_CACHE_TTL_MS
  }, [initialCrag, initialImages.length, initialPayloadLoadedAt, mountTimestamp])

  useEffect(() => {
    if (!hasFreshInitialPayload) return

    cragImageCache.set(id, {
      crag: initialCrag,
      images: initialImages,
      cragCenter: initialCragCenter,
      defaultRouteTargetByImageId: initialDefaultRouteTargetByImageId,
      routeImageIdsByClimbId: initialRouteImageIdsByClimbId,
      routePreviewByClimbId: initialRoutePreviewByClimbId,
      routeNavigationTargetByClimbId: initialRouteNavigationTargetByClimbId,
      cachedAt: initialPayloadLoadedAt || Date.now(),
    })
  }, [
    hasFreshInitialPayload,
    id,
    initialCrag,
    initialCragCenter,
    initialDefaultRouteTargetByImageId,
    initialImages,
    initialPayloadLoadedAt,
    initialRouteImageIdsByClimbId,
    initialRouteNavigationTargetByClimbId,
    initialRoutePreviewByClimbId,
  ])

  useEffect(() => {
    let ignore = false

    async function loadCrag() {
      const offlineOnly = typeof navigator !== 'undefined' && navigator.onLine === false
      const offlinePayloads = await getStoredCragClimbPayloadsSafely(id)
      const applyOfflineHydratedState = () => {
        if (ignore || offlinePayloads.length === 0) return false
        const hydrated = hydrateOfflineCragData(offlinePayloads)
        setImages(hydrated.images)
        setRoutes(hydrated.routes)
        setRoutesLoadState('loaded')
        setRouteImageIdsByClimbId(hydrated.routeImageIdsByClimbId)
        setRoutePreviewByClimbId(hydrated.routePreviewByClimbId)
        setDefaultRouteTargetByImageId(hydrated.defaultRouteTargetByImageId)
        setRouteNavigationTargetByClimbId(hydrated.routeNavigationTargetByClimbId)
        setCrag(initialCrag)
        setCragCenter(hydrated.cragCenter)
        setLoading(false)
        return true
      }

      const cached = getFreshCachedCragData(id)
      if (cached) {
        setCrag(cached.crag)
        setImages(cached.images)
        setCragCenter(cached.cragCenter)
        setDefaultRouteTargetByImageId(cached.defaultRouteTargetByImageId)
        setRouteImageIdsByClimbId(cached.routeImageIdsByClimbId || {})
        setRouteNavigationTargetByClimbId(cached.routeNavigationTargetByClimbId)
        setRoutePreviewByClimbId(cached.routePreviewByClimbId)
        setLoading(false)
      } else {
        if (!initialCrag) {
          setLoading(true)
        }
      }

      if (!hasInitialRouteData) {
        setRoutesLoadState('idle')
      }

      if (hasFreshInitialPayload) {
        setLoading(false)
        if (offlineOnly && applyOfflineHydratedState()) {
          return
        }
        return
      }

      if (offlineOnly && applyOfflineHydratedState()) {
        return
      }

      const supabase = createClient()

      const imagesPromise = supabase
        .from('images')
        .select('id, url, latitude, longitude, created_at, is_verified, verification_count, route_lines(count)')
        .eq('crag_id', id)
        .order('created_at', { ascending: false })

      const supplementaryImageIdsPromise = supabase
        .from('crag_images')
        .select('linked_image_id, source_image_id, url')
        .eq('crag_id', id)
        .not('linked_image_id', 'is', null)

      const cragPromise = initialCrag
        ? Promise.resolve({ data: initialCrag, error: null as null })
        : supabase
            .from('crags')
            .select(`
              *,
              climbing_areas:region_id (id, name)
            `)
            .eq('id', id)
            .single()

      let cragData
      let cragError
      let imagesData
      let imagesError
      let supplementaryImageIdsData
      let supplementaryImageIdsError

      try {
        ;[
          { data: cragData, error: cragError },
          { data: imagesData, error: imagesError },
          { data: supplementaryImageIdsData, error: supplementaryImageIdsError },
        ] = await Promise.all([cragPromise, imagesPromise, supplementaryImageIdsPromise])
      } catch (error) {
        if (applyOfflineHydratedState()) {
          return
        }

        throw error
      }

      if (cragError || !cragData) {
        if (applyOfflineHydratedState()) return
        if (ignore) return
        console.error('Error fetching crag:', cragError)
        setLoading(false)
        return
      }

      if (imagesError) {
        console.error('Error fetching images:', imagesError)
      }

      if (supplementaryImageIdsError) {
        console.error('Error fetching supplementary image IDs:', supplementaryImageIdsError)
      }

      const supplementaryImageIds = new Set<string>(
        (supplementaryImageIdsData || [])
          .flatMap((row: { linked_image_id: string | null; source_image_id?: string | null }) => [row.linked_image_id, row.source_image_id || null])
          .filter((value: string | null): value is string => typeof value === 'string' && value.length > 0)
      )

      const supplementaryImageUrls = new Set(
        (supplementaryImageIdsData || [])
          .filter((row: { source_image_id: string | null; url?: string | null }) => !!row.source_image_id)
          .map((row: { url?: string | null }) => row.url)
          .filter((value: string | null | undefined): value is string => typeof value === 'string' && value.length > 0)
      )

      const supplementaryCountByPrimaryId: Record<string, number> = {}
      for (const row of (supplementaryImageIdsData || []) as Array<{ source_image_id: string | null }>) {
        if (!row.source_image_id) continue
        supplementaryCountByPrimaryId[row.source_image_id] = (supplementaryCountByPrimaryId[row.source_image_id] || 0) + 1
      }

      const allImagesData = (imagesData || []) as RawImageRow[]
      const knownImageIds = new Set(allImagesData.map((image) => image.id))
      const missingSupplementaryImageIds = Array.from(supplementaryImageIds).filter((imageId) => !knownImageIds.has(imageId))

      let supplementaryImagesData: RawImageRow[] = []
      if (missingSupplementaryImageIds.length > 0) {
        const { data: extraImagesData, error: extraImagesError } = await supabase
          .from('images')
          .select('id, url, latitude, longitude, created_at, is_verified, verification_count, route_lines(count)')
          .in('id', missingSupplementaryImageIds)

        if (extraImagesError) {
          console.error('Error fetching supplementary images:', extraImagesError)
        } else {
          supplementaryImagesData = (extraImagesData || []) as RawImageRow[]
        }
      }

      const mergedImagesData = [...allImagesData, ...supplementaryImagesData]
      const selectableImageIdByImageId = buildSelectableImageIdByImageId(
        mergedImagesData.map((image) => ({
          id: image.id,
          latitude: image.latitude,
          longitude: image.longitude,
        })),
        (supplementaryImageIdsData || []) as Array<{ linked_image_id: string | null; source_image_id: string | null }>
      )

      const primaryImagesData = mergedImagesData.filter(
        (img: { id: string; url: string }) => !supplementaryImageIds.has(img.id) && !supplementaryImageUrls.has(img.url)
      )

      if ((imagesError || supplementaryImageIdsError || primaryImagesData.length === 0) && applyOfflineHydratedState()) {
        return
      }

      const formatImageRow = (img: RawImageRow): ImageData => {
        const routeLinesCount = Array.isArray(img.route_lines) && img.route_lines[0]
          ? img.route_lines[0].count
          : 0
        return {
          id: img.id,
          url: resolveRouteImageUrl(img.url),
          latitude: img.latitude,
          longitude: img.longitude,
          created_at: img.created_at ?? null,
          is_verified: img.is_verified || false,
          verification_count: img.verification_count || 0,
          route_lines_count: routeLinesCount,
          supplementary_faces_count: supplementaryCountByPrimaryId[img.id] || 0,
        }
      }

      const formattedImages: ImageData[] = primaryImagesData.map(formatImageRow)
      const previewImages = mergedImagesData.map(formatImageRow)

      const routeSource: CragRoute[] = hasInitialRouteData ? routes : initialRouteSource
      const routeClimbIds = Array.from(new Set(routeSource.map((route) => route.id).filter(Boolean)))
      const nextDefaultRouteTargetByImageId: Record<string, ImageRouteTarget> = {}
      const nextRouteImageIdsByClimbId: Record<string, string[]> = {}
      const imageById = new Map(previewImages.map((image) => [image.id, image]))
      const nextRoutePreviewByClimbId: Record<string, RoutePreview> = {}
      const nextRouteNavigationTargetByClimbId: Record<string, RouteNavigationTarget> = {}

      if (routeClimbIds.length > 0) {
        try {
          const { targetMaps } = await fetchRouteTargetMapsForClimbIds(
            supabase,
            routeClimbIds,
            imageById,
            selectableImageIdByImageId
          )
          Object.assign(nextDefaultRouteTargetByImageId, targetMaps.nextDefaultRouteTargetByImageId)
          Object.assign(nextRouteImageIdsByClimbId, targetMaps.nextRouteImageIdsByClimbId)
          Object.assign(nextRoutePreviewByClimbId, targetMaps.nextRoutePreviewByClimbId)
          Object.assign(nextRouteNavigationTargetByClimbId, targetMaps.nextRouteNavigationTargetByClimbId)
          console.debug('[Router Debug] Target Map populated with keys:', Object.keys(targetMaps.nextRouteNavigationTargetByClimbId))
        } catch (error) {
          console.error('Error fetching image route targets:', error)
        }
      }

      if (ignore) return

      setCrag(cragData)
      setImages(previewImages)
      setDefaultRouteTargetByImageId(nextDefaultRouteTargetByImageId)
      setRouteImageIdsByClimbId(nextRouteImageIdsByClimbId)
      setRoutePreviewByClimbId(nextRoutePreviewByClimbId)
      setRouteNavigationTargetByClimbId(nextRouteNavigationTargetByClimbId)
      const withCoords = formattedImages.filter(
        (img): img is ImageData & { latitude: number; longitude: number } => img.latitude !== null && img.longitude !== null
      )
      let nextCenter: [number, number] | null = null
      if (typeof cragData.latitude === 'number' && typeof cragData.longitude === 'number') {
        nextCenter = [cragData.latitude, cragData.longitude]
      } else if (withCoords.length > 0) {
        nextCenter = getAverageCoordinates(withCoords)
      }

      setCragCenter(nextCenter)
      setLoading(false)

      cragImageCache.set(id, {
        crag: cragData,
        images: previewImages,
        cragCenter: nextCenter,
        defaultRouteTargetByImageId: nextDefaultRouteTargetByImageId,
        routeImageIdsByClimbId: nextRouteImageIdsByClimbId,
        routePreviewByClimbId: nextRoutePreviewByClimbId,
        routeNavigationTargetByClimbId: nextRouteNavigationTargetByClimbId,
        cachedAt: Date.now(),
      })
    }

    loadCrag()

    return () => {
      ignore = true
    }
  }, [hasFreshInitialPayload, hasInitialRouteData, id, initialCrag, initialCragCenter, initialRouteSource, routes])

  useEffect(() => {
    if (routesLoadState !== 'idle') return

    let ignore = false

    async function loadRoutesForFilters() {
      const offlineOnly = typeof navigator !== 'undefined' && navigator.onLine === false
      const offlinePayloadsPromise = getStoredCragClimbPayloadsSafely(id)
      const applyOfflineRoutes = (offlinePayloads: ClimbPackResponse[]) => {
        if (ignore || offlinePayloads.length === 0) return false
        const hydrated = hydrateOfflineCragData(offlinePayloads)
        setRoutes(hydrated.routes)
        setRoutesLoadState('loaded')
        return true
      }

      setRoutesLoadState('loading')

      if (offlineOnly) {
        const offlinePayloads = await offlinePayloadsPromise
        if (applyOfflineRoutes(offlinePayloads)) {
          return
        }
        if (!ignore) {
          setRoutesLoadState('error')
        }
        return
      }

      const supabase = createClient()

      let routeMetricsData
      let routeMetricsError
      let effectiveClimbData
      let effectiveClimbError
      try {
        const response = await supabase.rpc('get_crag_route_intelligence', { p_crag_id: id })
        routeMetricsData = response.data
        routeMetricsError = response.error

        if (response.data && response.data.length > 0) {
          const routeRows = response.data as CragRouteIntelligenceRow[]
          const climbIds = routeRows.map((route: CragRouteIntelligenceRow) => route.id)
          const effectiveClimbResponse = await supabase
            .from('climbs')
            .select('id, shared_climb_id')
            .in('id', climbIds)

          effectiveClimbData = effectiveClimbResponse.data
          effectiveClimbError = effectiveClimbResponse.error
        }
      } catch (error) {
        const offlinePayloads = await offlinePayloadsPromise
        if (applyOfflineRoutes(offlinePayloads)) {
          return
        }
        throw error
      }

      if (ignore) return

      if (routeMetricsError) {
        const offlinePayloads = await offlinePayloadsPromise
        if (applyOfflineRoutes(offlinePayloads)) return
        console.error('Error fetching crag route intelligence:', routeMetricsError)
        setRoutesLoadState('error')
        return
      }

      if (effectiveClimbError) {
        console.error('Error fetching effective climb ids:', effectiveClimbError)
      }

      if (!routeMetricsData || routeMetricsData.length === 0) {
        const offlinePayloads = await offlinePayloadsPromise
        if (applyOfflineRoutes(offlinePayloads)) {
          return
        }
      }

      const nextRoutes = formatCragRoutes(routeMetricsData as CragRouteIntelligenceRow[] | null | undefined)
      const effectiveClimbIdByClimbId = Object.fromEntries(
        ((effectiveClimbData || []) as Array<{ id: string; shared_climb_id: string | null }>).map((row) => [row.id, row.shared_climb_id || row.id])
      )
      setRoutes(dedupeCragRoutes(nextRoutes, effectiveClimbIdByClimbId))
      setRoutePreviewByClimbId((prev) => remapRoutePreviewsByEffectiveClimbId(prev, effectiveClimbIdByClimbId))
      setRouteNavigationTargetByClimbId((prev) => remapRouteNavigationTargetsByEffectiveClimbId(prev, effectiveClimbIdByClimbId))
      setRoutesLoadState('loaded')
    }

    loadRoutesForFilters()

    return () => {
      ignore = true
    }
  }, [id, routesLoadState])

  const climbIdsFingerprint = useMemo(() => {
    return Array.from(new Set(routes.map((route) => route.id)))
      .sort((a, b) => a.localeCompare(b))
      .join(',')
  }, [routes])

  const hasCompleteInitialRouteTargets = useMemo(() => hasCompleteRouteTargets(
    routes,
    routeImageIdsByClimbId,
    routePreviewByClimbId,
    routeNavigationTargetByClimbId
  ), [routeImageIdsByClimbId, routeNavigationTargetByClimbId, routePreviewByClimbId, routes])

  useEffect(() => {
    if (!climbIdsFingerprint || hasCompleteInitialRouteTargets || isOfflineDocumentNavigationPreferred()) return

    let ignore = false

    async function rebuildRouteTargets() {
      const supabase = createClient()
      const climbIds = climbIdsFingerprint.split(',').filter(Boolean)
      if (climbIds.length === 0) return

      const imageById = new Map(images.map((image) => [image.id, image]))

      let targetMaps
      try {
        ;({ targetMaps } = await fetchRouteTargetMapsForClimbIds(
          supabase,
          climbIds,
          imageById
        ))
      } catch (error) {
        console.error('Error rebuilding route navigation targets:', error)
        return
      }

      if (ignore) return

      setRouteImageIdsByClimbId(targetMaps.nextRouteImageIdsByClimbId)
      setRoutePreviewByClimbId((prev) => ({ ...prev, ...targetMaps.nextRoutePreviewByClimbId }))
      setRouteNavigationTargetByClimbId((prev) => ({ ...prev, ...targetMaps.nextRouteNavigationTargetByClimbId }))

      console.debug('[Router Debug] Target Map populated with keys:', Object.keys(targetMaps.nextRouteNavigationTargetByClimbId))

      const cached = cragImageCache.get(id)
      if (cached) {
        cragImageCache.set(id, {
          ...cached,
          routeImageIdsByClimbId: targetMaps.nextRouteImageIdsByClimbId,
          routePreviewByClimbId: { ...cached.routePreviewByClimbId, ...targetMaps.nextRoutePreviewByClimbId },
          routeNavigationTargetByClimbId: { ...cached.routeNavigationTargetByClimbId, ...targetMaps.nextRouteNavigationTargetByClimbId },
        })
      }
    }

    void rebuildRouteTargets()

    return () => {
      ignore = true
    }
  }, [climbIdsFingerprint, hasCompleteInitialRouteTargets, id, images])

  return {
    crag,
    images,
    routes,
    routeImageIdsByClimbId,
    routePreviewByClimbId,
    routeNavigationTargetByClimbId,
    defaultRouteTargetByImageId,
    routesLoadState,
    loading,
    cragCenter,
  }
}
