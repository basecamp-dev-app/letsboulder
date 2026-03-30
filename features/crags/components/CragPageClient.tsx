
'use client'

import { useCallback, useEffect, useMemo, useState, startTransition } from 'react'
import type { MouseEvent } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { ChevronRight, X } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { createClient } from '@/lib/supabase'
import { csrfFetch } from '@/hooks/useCsrf'
import { PUBLIC_GRADES } from '@/lib/grades'
import { useGradeSystem } from '@/features/grades/hooks/useGradeSystem'
import { formatGradeForDisplay } from '@/lib/grade-display'
import CragPageToolbar, { type CragSwitcherOption } from '@/features/crags/components/CragPageToolbar'
import CragCommunitySidebar from '@/features/crags/components/CragCommunitySidebar'
import CragPageSkeleton from '@/features/crags/components/CragPageSkeleton'
import CragRouteList from '@/features/crags/components/CragRouteList'
import { buildCragRouteStats, buildEffectiveClimbLookup, buildRouteNavigationDisplayByClimbId, buildRoutePreviewDisplayByClimbId, dedupeCragRoutes, filterAndSortCragRoutes, formatBytes, formatCragRoutes, formatRouteTypeLabel, getAvailableDirections, getAverageCoordinates, getSearchModalResults, getStoredCragClimbPayloadsSafely, getRouteTypeChips, hydrateOfflineCragData, mapRouteTargetsByEffectiveClimbId, remapRoutePreviewsByEffectiveClimbId, sortImagesByViewCenter, sortPinClusters } from '@/features/crags/lib/crag-page-domain'
import type { CachedCragImageData, ClimbIdentityRow, CragRouteIntelligenceRow, RawImageRow, RouteLineTargetRow } from '@/features/crags/lib/crag-page-domain'
import { resolveRouteImageUrl } from '@/lib/media/route-image-url'
import { buildSelectableImageIdByImageId } from '@/lib/image-identity'
import { Button } from '@/components/ui/button'
import LightweightCragMap from '@/components/lightweight-crag-map'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { buildCragImageDestination, type ImageRouteTarget } from '@/features/crags/lib/build-crag-image-destination'
import type { OfflineJobProgressEvent } from '@/lib/offline/sw-messages'
import { getCragOfflinePreview, removeCragOffline, saveCragOffline } from '@/lib/offline/packs'
import type { ClimbPackResponse } from '@/lib/climb/queries'
import { Input } from '@/components/ui/input'
import { buildCragPinClusters, type ClusterableCragImage } from '@/lib/crag-pin-clusters'
import type { Crag, CragRoute, ImageData, RouteNavigationTarget, RoutePreview } from '@/features/crags/lib/crag-page-types'

const FILTER_GRADES = PUBLIC_GRADES

interface ClusteredImageData extends ClusterableCragImage {
  id: string
  url: string
  latitude: number | null
  longitude: number | null
  created_at?: string | null
  route_lines_count: number
  is_verified: boolean
  verification_count: number
  supplementary_faces_count: number
}


interface ResolvedRouteDestination {
  href: string
  ready: boolean
}

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

interface CragPageClientProps {
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
  communityPlaceSlug?: string | null
}

export default function CragPageClient({
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
  communityPlaceSlug,
}: CragPageClientProps) {
  const router = useRouter()
  const pathname = usePathname()
  const gradeSystem = useGradeSystem()
  const [crag, setCrag] = useState<Crag | null>(initialCrag)
  const hasInitialRouteData = initialRoutes !== null
  const [images, setImages] = useState<ImageData[]>(initialImages)
  const [routes, setRoutes] = useState<CragRoute[]>(initialRoutes || [])
  const [routeImageIdsByClimbId, setRouteImageIdsByClimbId] = useState<Record<string, string[]>>(initialRouteImageIdsByClimbId)
  const [routePreviewByClimbId, setRoutePreviewByClimbId] = useState<Record<string, RoutePreview>>(initialRoutePreviewByClimbId)
  const [routesLoadState, setRoutesLoadState] = useState<'idle' | 'loading' | 'loaded' | 'error'>(hasInitialRouteData ? 'loaded' : 'idle')
  const [routeSort, setRouteSort] = useState<'sends' | 'rating' | 'grade' | 'name'>('sends')
  const [minGrade, setMinGrade] = useState<string>('')
  const [maxGrade, setMaxGrade] = useState<string>('')
  const [minRating, setMinRating] = useState<string>('')
  const [minSends, setMinSends] = useState<string>('')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedDirections, setSelectedDirections] = useState<string[]>([])
  const [selectedRouteTypes, setSelectedRouteTypes] = useState<string[]>([])
  const [topoOnly, setTopoOnly] = useState(false)
  const [searchModalOpen, setSearchModalOpen] = useState(false)
  const [filterModalOpen, setFilterModalOpen] = useState(false)
  const [sortModalOpen, setSortModalOpen] = useState(false)
  const [cragSwitcherOpen, setCragSwitcherOpen] = useState(false)
  const [cragSwitcherQuery, setCragSwitcherQuery] = useState('')
  const [cragSwitcherOptions, setCragSwitcherOptions] = useState<CragSwitcherOption[]>([])
  const [cragCenter, setCragCenter] = useState<[number, number] | null>(initialCragCenter)
  const [loading, setLoading] = useState(!initialCrag)
  const [isAdmin, setIsAdmin] = useState(false)
  const [isFlagging, setIsFlagging] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null)
  const [offlineDialogOpen, setOfflineDialogOpen] = useState(false)
  const [offlineDialogLoading, setOfflineDialogLoading] = useState(false)
  const [offlinePreviewLoading, setOfflinePreviewLoading] = useState(false)
  const [offlineError, setOfflineError] = useState<string | null>(null)
  const [offlinePreview, setOfflinePreview] = useState<Awaited<ReturnType<typeof getCragOfflinePreview>> | null>(null)
  const [offlineProgress, setOfflineProgress] = useState<OfflineJobProgressEvent | null>(null)
  const [defaultRouteTargetByImageId, setDefaultRouteTargetByImageId] = useState<Record<string, ImageRouteTarget>>(initialDefaultRouteTargetByImageId)
  const [routeNavigationTargetByClimbId, setRouteNavigationTargetByClimbId] = useState<Record<string, RouteNavigationTarget>>(initialRouteNavigationTargetByClimbId)

  const initialRouteSource = useMemo(() => initialRoutes || [], [initialRoutes])
  const hasFreshInitialPayload = useMemo(() => {
    if (!initialCrag || initialImages.length === 0 || !initialPayloadLoadedAt) return false
    return Date.now() - initialPayloadLoadedAt <= CRAG_IMAGE_CACHE_TTL_MS
  }, [initialCrag, initialImages.length, initialPayloadLoadedAt])

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

  const refreshCragOfflinePreview = useCallback(async () => {
    setOfflinePreviewLoading(true)
    try {
      const preview = await getCragOfflinePreview(id)
      setOfflinePreview(preview)
      setOfflineError(null)
    } catch (error) {
      console.error('Failed to load crag offline preview:', error)
      setOfflineError('Offline pack preview is unavailable right now.')
      setOfflinePreview(null)
    } finally {
      setOfflinePreviewLoading(false)
    }
  }, [id])

  useEffect(() => {
    void refreshCragOfflinePreview()
  }, [refreshCragOfflinePreview])

  useEffect(() => {
    let ignore = false

    async function loadCragSwitcherOptions() {
      if (!initialCrag) return
      const sourceCrag = initialCrag
      const fallbackOption: CragSwitcherOption = {
        id: sourceCrag.id,
        name: sourceCrag.name,
        regionName: sourceCrag.region_name || sourceCrag.climbing_areas?.name || null,
        subArea: sourceCrag.sub_area || null,
        countryCode: sourceCrag.country_code || null,
      }

      if (cragSwitcherQuery.trim().length >= 2) {
        try {
          const response = await fetch(`/api/crags/search?q=${encodeURIComponent(cragSwitcherQuery.trim())}`)
          const payload = await response.json() as Array<{ id: string; name: string; regionName?: string | null; subArea?: string | null; countryCode?: string | null }>
          if (ignore) return
          const next = payload.map((item) => ({
            id: item.id,
            name: item.name,
            regionName: item.regionName || null,
            subArea: item.subArea || null,
            countryCode: item.countryCode || null,
          }))
          if (!next.some((item) => item.id === fallbackOption.id)) {
            next.unshift(fallbackOption)
          }
          setCragSwitcherOptions(next)
          return
        } catch {
          if (ignore) return
        }
      }

      if (typeof sourceCrag.latitude === 'number' && typeof sourceCrag.longitude === 'number') {
        try {
          const response = await fetch(`/api/crags/nearby?lat=${sourceCrag.latitude}&lng=${sourceCrag.longitude}`)
          const payload = await response.json() as Array<{ id: string; name: string; regionName?: string | null; subArea?: string | null; countryCode?: string | null }>
          if (ignore) return
          const next = payload.map((item) => ({
            id: item.id,
            name: item.name,
            regionName: item.regionName || null,
            subArea: item.subArea || null,
            countryCode: item.countryCode || null,
          }))
          if (!next.some((item) => item.id === fallbackOption.id)) {
            next.unshift(fallbackOption)
          }
          setCragSwitcherOptions(next)
          return
        } catch {
          if (ignore) return
        }
      }

      if (!ignore) {
        setCragSwitcherOptions([fallbackOption])
      }
    }

    void loadCragSwitcherOptions()

    return () => {
      ignore = true
    }
  }, [cragSwitcherQuery, initialCrag])

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
        const { data: climbIdentityData, error: climbIdentityError } = await supabase
          .from('climbs')
          .select('id, shared_climb_id')
          .or(`id.in.(${routeClimbIds.join(',')}),shared_climb_id.in.(${routeClimbIds.join(',')})`)

        if (climbIdentityError) {
          console.error('Error fetching climb identities for route targets:', climbIdentityError)
        }

        const { effectiveClimbIdByClimbId, climbIdsByEffectiveClimbId } = buildEffectiveClimbLookup(
          (climbIdentityData || []) as ClimbIdentityRow[]
        )
        const routeLineClimbIds = Array.from(new Set([
          ...routeClimbIds,
          ...routeClimbIds.flatMap((climbId) => climbIdsByEffectiveClimbId[climbId] || []),
        ]))

        const { data: routeTargetsData, error: routeTargetsError } = await supabase
          .from('route_lines')
          .select('id, image_id, climb_id, climbs(slug)')
          .in('climb_id', routeLineClimbIds)
          .order('climb_id', { ascending: true })
          .order('sequence_order', { ascending: true, nullsFirst: false })
          .order('created_at', { ascending: true })

        if (routeTargetsError) {
          console.error('Error fetching image route targets:', routeTargetsError)
        } else {
          for (const row of (routeTargetsData || []) as RouteLineTargetRow[]) {
            const effectiveClimbId = effectiveClimbIdByClimbId[row.climb_id] || row.climb_id
            const selectableImageId = selectableImageIdByImageId[row.image_id] || row.image_id
            const climbImageIds = nextRouteImageIdsByClimbId[effectiveClimbId] || []
            if (!climbImageIds.includes(selectableImageId)) {
              climbImageIds.push(selectableImageId)
              nextRouteImageIdsByClimbId[effectiveClimbId] = climbImageIds
            }
            if (nextDefaultRouteTargetByImageId[selectableImageId]) continue
            const climb = Array.isArray(row.climbs) ? row.climbs[0] : row.climbs
            nextDefaultRouteTargetByImageId[selectableImageId] = {
              climbId: row.climb_id,
              routeId: row.id,
              climbSlug: climb?.slug || null,
              imageId: selectableImageId,
            }
          }

          const mappedTargets = mapRouteTargetsByEffectiveClimbId(
            (routeTargetsData || []) as RouteLineTargetRow[],
            imageById,
            effectiveClimbIdByClimbId,
            selectableImageIdByImageId
          )

          Object.assign(nextRoutePreviewByClimbId, mappedTargets.nextRoutePreviewByClimbId)
          Object.assign(nextRouteNavigationTargetByClimbId, mappedTargets.nextRouteNavigationTargetByClimbId)
          console.debug('[Router Debug] Target Map populated with keys:', Object.keys(mappedTargets.nextRouteNavigationTargetByClimbId))
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
    let ignore = false

    async function loadAdminStatus() {
      if (isOfflineDocumentNavigationPreferred()) return

      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user || ignore) return

      if (user.app_metadata?.gsyrocks_admin === true) {
        setIsAdmin(true)
        return
      }

      try {
        const { data: profile } = await supabase
          .from('profiles')
          .select('is_admin')
          .eq('id', user.id)
          .single()

        if (ignore) return
        setIsAdmin(profile?.is_admin === true)
      } catch {
        if (ignore) return
        setIsAdmin(false)
      }
    }

    void loadAdminStatus()

    return () => {
      ignore = true
    }
  }, [])

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
      setRouteNavigationTargetByClimbId((prev) => {
        const nextTargets: Record<string, RouteNavigationTarget> = {}

        for (const [climbId, target] of Object.entries(prev)) {
          const effectiveClimbId = effectiveClimbIdByClimbId[climbId] || climbId
          if (!nextTargets[effectiveClimbId]) {
            nextTargets[effectiveClimbId] = target.climbId === effectiveClimbId
              ? target
              : {
                  ...target,
                  climbId: effectiveClimbId,
                }
          }
        }

        return nextTargets
      })
      setRoutesLoadState('loaded')
    }

    loadRoutesForFilters()

    return () => {
      ignore = true
    }
  }, [id, routesLoadState])

  const handleFlagCrag = async (cragId: string) => {
    if (isFlagging) return
    setIsFlagging(true)
    setToast(null)

    try {
      const response = await csrfFetch(`/api/crags/${cragId}/flag`, {
        method: 'POST',
      })

      const data = await response.json()

      if (!response.ok) {
        setToast(data.error || 'Failed to flag crag')
        return
      }

      setToast('Crag flagged for review')
      setTimeout(() => setToast(null), 3000)
    } catch {
      setToast('Failed to flag crag')
      setTimeout(() => setToast(null), 3000)
    } finally {
      setIsFlagging(false)
    }
  }

  const viewCenter = cragCenter

  const orderedImages = useMemo(() => {
    return sortImagesByViewCenter(images, viewCenter)
  }, [images, viewCenter])

  const imageById = useMemo(() => {
    return new Map(orderedImages.map((image) => [image.id, image as ClusteredImageData]))
  }, [orderedImages])

  const clusteredPins = useMemo(() => {
    return buildCragPinClusters(orderedImages as ClusteredImageData[], 6)
  }, [orderedImages])

  const orderedPinClusters = useMemo(() => {
    return sortPinClusters(
      clusteredPins.clusters.map((cluster) => ({ ...cluster, badgeNumber: 0 })),
      viewCenter
    )
  }, [clusteredPins.clusters, viewCenter])

  const mapPins = useMemo(() => {
    return orderedPinClusters.map((cluster) => ({
      id: cluster.representativeImageId,
      latitude: cluster.latitude,
      longitude: cluster.longitude,
      label: String(cluster.badgeNumber),
    }))
  }, [orderedPinClusters])

  const pinNumberByImageId = useMemo(() => {
    const mapping = new Map<string, number>()
    orderedPinClusters.forEach((cluster) => {
      cluster.images.forEach((image: ClusteredImageData) => {
        mapping.set(image.id, cluster.badgeNumber)
      })
    })
    return mapping
  }, [orderedPinClusters])

  const routePreviewDisplayByClimbId = useMemo(() => {
    return buildRoutePreviewDisplayByClimbId(routePreviewByClimbId, imageById)
  }, [imageById, routePreviewByClimbId])

  const routeNavigationDisplayByClimbId = useMemo(() => {
    return buildRouteNavigationDisplayByClimbId(routeNavigationTargetByClimbId, imageById)
  }, [imageById, routeNavigationTargetByClimbId])

  const selectedImageIds = useMemo(() => {
    if (!selectedImageId) return new Set<string>()

    const selectedClusterId = clusteredPins.clusterIdByImageId.get(selectedImageId)
    if (!selectedClusterId) return new Set([selectedImageId])

    const selectedCluster = clusteredPins.clusters.find((cluster) => cluster.id === selectedClusterId)
    if (!selectedCluster) return new Set([selectedImageId])

    return new Set(selectedCluster.images.map((image) => image.id))
  }, [clusteredPins.clusterIdByImageId, clusteredPins.clusters, selectedImageId])

  const highlightedRouteIds = useMemo(() => {
    if (!selectedImageId) return new Set<string>()

    const matches = new Set<string>()
    for (const route of routes) {
      const routeImageIds = routeImageIdsByClimbId[route.id] || []
      if (routeImageIds.some((imageId) => selectedImageIds.has(imageId))) {
        matches.add(route.id)
        continue
      }

      if (routePreviewDisplayByClimbId[route.id]?.imageId && selectedImageIds.has(routePreviewDisplayByClimbId[route.id].imageId)) {
        matches.add(route.id)
        continue
      }

      if (routeNavigationDisplayByClimbId[route.id]?.displayImageId && selectedImageIds.has(routeNavigationDisplayByClimbId[route.id].displayImageId)) {
        matches.add(route.id)
      }
    }

    return matches
  }, [routeImageIdsByClimbId, routeNavigationDisplayByClimbId, routePreviewDisplayByClimbId, routes, selectedImageIds, selectedImageId])

  const selectedRouteCount = useMemo(() => {
    if (!selectedImageId) return 0
    return routes.reduce((count, route) => count + (highlightedRouteIds.has(route.id) ? 1 : 0), 0)
  }, [highlightedRouteIds, routes, selectedImageId])

  useEffect(() => {
    if (!selectedImageId) return

    console.debug('[Crag Debug] Pin selection state', {
      selectedImageId,
      selectedImageIds: Array.from(selectedImageIds),
      highlightedRouteIds: Array.from(highlightedRouteIds),
      routeImageIdsByClimbIdKeys: Object.keys(routeImageIdsByClimbId),
      routeCount: routes.length,
    })
  }, [highlightedRouteIds, routeImageIdsByClimbId, routes, selectedImageId, selectedImageIds])

  const climbIdsFingerprint = useMemo(() => {
    return Array.from(new Set(routes.map((route) => route.id)))
      .sort((a, b) => a.localeCompare(b))
      .join(',')
  }, [routes])

  const hasCompleteInitialRouteTargets = useMemo(() => {
    if (routes.length === 0) return true

    return routes.every((route) => {
      const hasImageIds = (routeImageIdsByClimbId[route.id] || []).length > 0
      const hasPreview = Boolean(routePreviewByClimbId[route.id])
      const hasNavigationTarget = Boolean(routeNavigationTargetByClimbId[route.id])
      return hasImageIds && hasPreview && hasNavigationTarget
    })
  }, [routeImageIdsByClimbId, routeNavigationTargetByClimbId, routePreviewByClimbId, routes])

  useEffect(() => {
    if (!climbIdsFingerprint || hasCompleteInitialRouteTargets || isOfflineDocumentNavigationPreferred()) return

    let ignore = false

    async function rebuildRouteTargets() {
      const supabase = createClient()
      const climbIds = climbIdsFingerprint.split(',').filter(Boolean)
      if (climbIds.length === 0) return

      const { data: climbIdentityData, error: climbIdentityError } = await supabase
        .from('climbs')
        .select('id, shared_climb_id')
        .or(`id.in.(${climbIds.join(',')}),shared_climb_id.in.(${climbIds.join(',')})`)

      if (climbIdentityError) {
        console.error('Error fetching climb identities while rebuilding route navigation targets:', climbIdentityError)
      }

      const { effectiveClimbIdByClimbId, climbIdsByEffectiveClimbId } = buildEffectiveClimbLookup(
        (climbIdentityData || []) as ClimbIdentityRow[]
      )
      const routeLineClimbIds = Array.from(new Set([
        ...climbIds,
        ...climbIds.flatMap((climbId) => climbIdsByEffectiveClimbId[climbId] || []),
      ]))

      const { data: routeTargetsData, error: routeTargetsError } = await supabase
        .from('route_lines')
        .select('id, image_id, climb_id, climbs(slug)')
        .in('climb_id', routeLineClimbIds)
        .order('climb_id', { ascending: true })
        .order('sequence_order', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: true })

      if (routeTargetsError) {
        console.error('Error rebuilding route navigation targets:', routeTargetsError)
        return
      }

      const mappedTargets = mapRouteTargetsByEffectiveClimbId(
        (routeTargetsData || []) as RouteLineTargetRow[],
        imageById,
        effectiveClimbIdByClimbId
      )

      const nextRouteImageIdsByClimbId: Record<string, string[]> = {}
      for (const row of (routeTargetsData || []) as RouteLineTargetRow[]) {
        const effectiveClimbId = effectiveClimbIdByClimbId[row.climb_id] || row.climb_id
        const climbImageIds = nextRouteImageIdsByClimbId[effectiveClimbId] || []
        if (!climbImageIds.includes(row.image_id)) {
          climbImageIds.push(row.image_id)
          nextRouteImageIdsByClimbId[effectiveClimbId] = climbImageIds
        }
      }

      if (ignore) return

      setRouteImageIdsByClimbId(nextRouteImageIdsByClimbId)
      setRoutePreviewByClimbId((prev) => ({ ...prev, ...mappedTargets.nextRoutePreviewByClimbId }))
      setRouteNavigationTargetByClimbId((prev) => ({ ...prev, ...mappedTargets.nextRouteNavigationTargetByClimbId }))

      console.debug('[Router Debug] Target Map populated with keys:', Object.keys(mappedTargets.nextRouteNavigationTargetByClimbId))

      const cached = cragImageCache.get(id)
      if (cached) {
        cragImageCache.set(id, {
          ...cached,
          routeImageIdsByClimbId: nextRouteImageIdsByClimbId,
          routePreviewByClimbId: { ...cached.routePreviewByClimbId, ...mappedTargets.nextRoutePreviewByClimbId },
          routeNavigationTargetByClimbId: { ...cached.routeNavigationTargetByClimbId, ...mappedTargets.nextRouteNavigationTargetByClimbId },
        })
      }
    }

    void rebuildRouteTargets()

    return () => {
      ignore = true
    }
  }, [climbIdsFingerprint, hasCompleteInitialRouteTargets, id, imageById])

  const routeTypeChips = useMemo(() => {
    return getRouteTypeChips(routes)
  }, [routes])

  const clearAllRouteFilters = useCallback(() => {
    setSelectedImageId(null)
    setMinGrade('')
    setMaxGrade('')
    setMinRating('')
    setMinSends('')
    setSearchQuery('')
    setSelectedDirections([])
    setSelectedRouteTypes([])
    setTopoOnly(false)
  }, [])

  const hasActiveRouteFilters = useMemo(() => {
    return Boolean(
      selectedImageId
      || minGrade
      || maxGrade
      || minRating
      || minSends
      || searchQuery.trim()
      || selectedDirections.length > 0
      || selectedRouteTypes.length > 0
      || topoOnly
    )
  }, [maxGrade, minGrade, minRating, minSends, searchQuery, selectedDirections.length, selectedRouteTypes.length, selectedImageId, topoOnly])

  const routeHrefBase = useMemo(() => {
    if (!crag?.country_code || !crag.slug) return null
    return `/${crag.country_code.toLowerCase()}/${crag.slug}`
  }, [crag?.country_code, crag?.slug])

  const availableDirections = useMemo(() => {
    return getAvailableDirections(routes)
  }, [routes])

  const filteredRoutes = useMemo(() => {
    return filterAndSortCragRoutes(routes, highlightedRouteIds, routeSort, {
      selectedImageId,
      minGrade,
      maxGrade,
      minRating,
      minSends,
      searchQuery,
      selectedDirections,
      selectedRouteTypes,
      topoOnly,
    })
  }, [highlightedRouteIds, maxGrade, minGrade, minRating, minSends, routeSort, routes, searchQuery, selectedDirections, selectedImageId, selectedRouteTypes, topoOnly])

  const routeStats = useMemo(() => {
    return buildCragRouteStats(routes)
  }, [routes])

  const routeInsightsState = routesLoadState

  const routeInsightsUnavailable = routeInsightsState === 'error'
  const routeLocationLabel = crag?.sub_area || crag?.region_name || crag?.climbing_areas?.name || 'Area details pending'

  const searchModalResults = useMemo(() => {
    return getSearchModalResults(routes, searchQuery)
  }, [routes, searchQuery])

  const activeRouteFilterChips = useMemo(() => {
    const chips: Array<{ key: string; label: string; onRemove: () => void }> = []

    if (minGrade) {
      chips.push({
        key: 'min-grade',
        label: `Min ${formatGradeForDisplay(minGrade, gradeSystem)}`,
        onRemove: () => setMinGrade(''),
      })
    }

    if (maxGrade) {
      chips.push({
        key: 'max-grade',
        label: `Max ${formatGradeForDisplay(maxGrade, gradeSystem)}`,
        onRemove: () => setMaxGrade(''),
      })
    }

    if (minRating) {
      chips.push({
        key: 'min-rating',
        label: `${minRating}+ stars`,
        onRemove: () => setMinRating(''),
      })
    }

    if (minSends) {
      chips.push({
        key: 'min-sends',
        label: `${minSends}+ sends`,
        onRemove: () => setMinSends(''),
      })
    }

    if (searchQuery.trim()) {
      chips.push({
        key: 'search',
        label: `Search: ${searchQuery.trim()}`,
        onRemove: () => setSearchQuery(''),
      })
    }

    if (topoOnly) {
      chips.push({
        key: 'topo-only',
        label: 'Topo only',
        onRemove: () => setTopoOnly(false),
      })
    }

    for (const direction of selectedDirections) {
      chips.push({
        key: `direction-${direction}`,
        label: `Face ${direction}`,
        onRemove: () => setSelectedDirections((prev) => prev.filter((item) => item !== direction)),
      })
    }

    for (const routeType of selectedRouteTypes) {
      chips.push({
        key: `route-type-${routeType}`,
        label: formatRouteTypeLabel(routeType),
        onRemove: () => setSelectedRouteTypes((prev) => prev.filter((item) => item !== routeType)),
      })
    }

    return chips
  }, [gradeSystem, maxGrade, minGrade, minRating, minSends, searchQuery, selectedDirections, selectedRouteTypes, topoOnly])

  const getRouteDestination = useCallback((route: CragRoute): ResolvedRouteDestination => {
    const offlineOnly = isOfflineDocumentNavigationPreferred()
    const routeTarget = routeNavigationDisplayByClimbId[route.id]
    if (routeTarget) {
      const routeClimbId = routeTarget.climbId || route.id
      return {
        href: buildCragImageDestination({
          imageId: routeTarget.displayImageId,
          target: {
            ...routeTarget,
            climbId: routeClimbId,
            climbSlug: route.slug || routeTarget.climbSlug,
          },
          routeHrefBase,
          offlineOnly,
        }),
        ready: true,
      }
    }

    const preview = routePreviewDisplayByClimbId[route.id]
    const fallbackImageId = preview?.imageId
    const fallbackTarget = fallbackImageId ? defaultRouteTargetByImageId[fallbackImageId] : undefined

    if (fallbackImageId && fallbackTarget) {
      return {
        href: buildCragImageDestination({
          imageId: fallbackImageId,
          target: {
            ...fallbackTarget,
            climbId: fallbackTarget.climbId || route.id,
            routeId: fallbackTarget.routeId || route.id,
            climbSlug: route.slug || fallbackTarget.climbSlug,
          },
          routeHrefBase,
          offlineOnly,
        }),
        ready: true,
      }
    }

    if (!offlineOnly && fallbackImageId) {
      return {
        href: buildCragImageDestination({
          imageId: fallbackImageId,
          routeHrefBase,
          offlineOnly: false,
        }),
        ready: false,
      }
    }

    console.warn(`[Router Debug] Route target miss for climb_id: ${route.id}. Falling back to slug.`)

    if (offlineOnly) {
      return {
        href: `/climb/${route.id}`,
        ready: true,
      }
    }

    if (route.slug && routeHrefBase) {
      return {
        href: `${routeHrefBase}/${route.slug}`,
        ready: false,
      }
    }

    return {
      href: `/climb/${route.id}`,
      ready: false,
    }
  }, [defaultRouteTargetByImageId, routeHrefBase, routeNavigationDisplayByClimbId, routePreviewDisplayByClimbId])

  const handlePendingRouteNavigation = useCallback((event: MouseEvent<HTMLButtonElement>, route: CragRoute) => {
    event.preventDefault()
    const destination = getRouteDestination(route)
    if (!destination.ready) return
    router.push(destination.href)
  }, [getRouteDestination, router])

  const prefetchImageDestination = useCallback((imageId: string) => {
    if (!imageId) return
  }, [])

  useEffect(() => {
    if (orderedImages.length === 0) return

    const idsToPrefetch = orderedImages.slice(0, 8).map((image) => image.id)
    const runPrefetch = () => {
      idsToPrefetch.forEach((imageId) => prefetchImageDestination(imageId))
    }

    let idleId: number | null = null
    const timeoutId = window.setTimeout(runPrefetch, 700)

    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      idleId = window.requestIdleCallback(runPrefetch, { timeout: 1200 })
    }

    return () => {
      window.clearTimeout(timeoutId)
      if (idleId !== null && typeof window !== 'undefined' && 'cancelIdleCallback' in window) {
        window.cancelIdleCallback(idleId)
      }
    }
  }, [orderedImages, prefetchImageDestination])

  const redirectToAuth = useCallback(() => {
    startTransition(() => {
      router.push(`/auth?redirect_to=${encodeURIComponent(pathname || `/crag/${id}`)}`)
    })
  }, [id, pathname, router])

  if (loading) {
    return <CragPageSkeleton />
  }

  if (!crag) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-gray-500 dark:text-gray-400">Crag not found</div>
      </div>
    )
  }

  const canDownloadCrag = !offlineDialogLoading
  const projectedUsage = offlinePreview
    ? offlinePreview.usageBytes - (offlinePreview.existingPack?.estimatedBytes || 0) + (offlinePreview.deltaBytes || 0)
    : 0
  const overOfflineBudget = !!offlinePreview && projectedUsage > offlinePreview.budgetBytes
  const canSaveCragOffline = !offlineDialogLoading && !offlinePreviewLoading && !overOfflineBudget && !offlinePreview?.isUpToDate

  const handleOpenOfflineDialog = async () => {
    setOfflineDialogOpen(true)
    void refreshCragOfflinePreview()
  }

  const handleSaveCragOffline = async () => {
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      redirectToAuth()
      return
    }

    setOfflineDialogLoading(true)
    setOfflineProgress(null)

    try {
      if (typeof navigator !== 'undefined' && navigator.storage?.persist) {
        await navigator.storage.persist().catch(() => false)
      }

      const result = await saveCragOffline(id, (event) => {
        setOfflineProgress(event)
      })
      await result.completed
      await refreshCragOfflinePreview()
      setToast(result.warning || (offlinePreview?.existingPack ? 'Offline crag pack updated' : 'Crag saved for offline use'))
      setTimeout(() => setToast(null), 3000)
    } catch (error) {
      console.error('Failed to save crag offline pack:', error)
      setToast(error instanceof Error ? error.message : 'Failed to save crag offline pack')
      setTimeout(() => setToast(null), 3000)
    } finally {
      setOfflineDialogLoading(false)
      setOfflineProgress(null)
    }
  }

  const handleRemoveCragOffline = async () => {
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      redirectToAuth()
      return
    }

    setOfflineDialogLoading(true)
    try {
      await removeCragOffline(id)
      await refreshCragOfflinePreview()
      setOfflineDialogOpen(false)
      setToast('Offline crag pack removed')
      setTimeout(() => setToast(null), 2500)
    } catch (error) {
      console.error('Failed to remove crag pack:', error)
      setToast('Failed to remove offline crag pack')
      setTimeout(() => setToast(null), 2500)
    } finally {
      setOfflineDialogLoading(false)
      setOfflineProgress(null)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-blue-600 text-white px-4 py-2 rounded-lg shadow-lg">
          {toast}
        </div>
      )}
      <div className="relative z-0 h-[34vh] md:h-[58vh] bg-gray-200 dark:bg-gray-800">
        <LightweightCragMap
          pins={mapPins}
          activePinId={selectedImageId}
          initialCenter={cragCenter}
          onPinSelect={(imageId) => {
            console.debug('[Crag Debug] Pin clicked', {
              imageId,
              currentSelectedImageId: selectedImageId,
              clusterId: clusteredPins.clusterIdByImageId.get(imageId) || null,
            })
            setSelectedImageId(imageId)
          }}
        />

        <div className="absolute top-4 left-4 z-[1000] bg-white/90 dark:bg-gray-800/90 rounded-lg px-3 py-2 text-sm font-semibold text-gray-900 dark:text-gray-100 shadow-md backdrop-blur">
          {crag.name}
        </div>

        {isAdmin && (
          <button
            onClick={() => handleFlagCrag(crag.id)}
            disabled={isFlagging}
            className="absolute top-4 right-4 z-[1000] px-3 py-2 bg-red-600 text-white text-sm font-semibold rounded-lg shadow-md hover:bg-red-500 disabled:opacity-50 transition-colors"
          >
            {isFlagging ? 'Flagging...' : '🚩 Flag'}
          </button>
        )}
      </div>

      <div className="relative max-w-5xl mx-auto px-4 py-4 space-y-6">
        <section className="space-y-3">
          <CragPageToolbar
            crag={crag}
            cragSwitcherOpen={cragSwitcherOpen}
            cragSwitcherQuery={cragSwitcherQuery}
            cragSwitcherOptions={cragSwitcherOptions}
            canDownloadCrag={canDownloadCrag}
            offlineDialogLoading={offlineDialogLoading}
            offlinePreviewLoading={offlinePreviewLoading}
            hasActiveRouteFilters={hasActiveRouteFilters}
            selectedImageId={selectedImageId}
            selectedRouteCount={selectedRouteCount}
            routesCount={routes.length}
            onToggleCragSwitcher={() => setCragSwitcherOpen((prev) => !prev)}
            onCragSwitcherQueryChange={setCragSwitcherQuery}
            onCloseCragSwitcher={() => setCragSwitcherOpen(false)}
            onOpenOfflineDialog={handleOpenOfflineDialog}
            onOpenSearchModal={() => setSearchModalOpen(true)}
            onOpenFilterModal={() => setFilterModalOpen(true)}
            onOpenSortModal={() => setSortModalOpen(true)}
            onClearRouteFilters={clearAllRouteFilters}
          />

          <div className="space-y-4">
            {routeInsightsUnavailable ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-100">
                Route intelligence is unavailable right now. Crag stats and sorting signals will appear again once the route metrics query is reachable.
              </div>
            ) : null}
            {activeRouteFilterChips.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {activeRouteFilterChips.map((chip) => (
                  <button key={chip.key} type="button" onClick={chip.onRemove} className="rounded-full border border-stone-300 bg-white px-3 py-1 text-xs font-medium text-stone-700 shadow-sm transition hover:border-stone-400 hover:bg-stone-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700">
                    {chip.label} ×
                  </button>
                ))}
              </div>
            ) : null}

            <CragRouteList
              filteredRoutes={filteredRoutes}
              routesLoadState={routesLoadState}
              highlightedRouteIds={highlightedRouteIds}
              routePreviewDisplayByClimbId={routePreviewDisplayByClimbId}
              pinNumberByImageId={pinNumberByImageId}
              gradeSystem={gradeSystem}
              onPendingRouteNavigation={handlePendingRouteNavigation}
              getRouteDestination={getRouteDestination}
            />
          </div>
        </section>

        <CragCommunitySidebar communityPlaceSlug={communityPlaceSlug} />
      </div>

      <Dialog open={searchModalOpen} onOpenChange={setSearchModalOpen}>
        <DialogContent showCloseButton={false} className="max-w-2xl rounded-[28px] border-stone-200 bg-white p-0 dark:border-gray-800 dark:bg-gray-900">
          <div className="flex items-center justify-between border-b border-stone-200 px-4 py-3 dark:border-gray-800">
            <DialogClose className="rounded-full border border-stone-200 p-2 text-stone-600 dark:border-gray-700 dark:text-gray-300"><X className="size-4" /></DialogClose>
            <DialogTitle className="text-base">Search climbs, areas, subareas</DialogTitle>
            <div className="size-9" />
          </div>
          <div className="p-4">
            <Input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search climbs here" className="border-stone-300 bg-white dark:border-gray-700 dark:bg-gray-800" />
            <div className="mt-4 space-y-4">
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-stone-500 dark:text-gray-400">Climbs</p>
                <div className="space-y-2">
                  {searchModalResults.length === 0 ? <p className="text-sm text-stone-500 dark:text-gray-400">No climbs match yet.</p> : searchModalResults.map((route) => {
                    const destination = getRouteDestination(route)
                    const content = (
                      <>
                        <span>{route.name} <span className="text-stone-500">{formatGradeForDisplay(route.grade, gradeSystem)}</span></span>
                        <ChevronRight className="size-4 text-stone-400" />
                      </>
                    )

                    if (!destination.ready) {
                      return (
                        <button key={route.id} type="button" onClick={(event) => handlePendingRouteNavigation(event, route)} className="flex w-full items-center justify-between rounded-xl border border-stone-200 px-3 py-2 text-left text-sm hover:bg-stone-50 dark:border-gray-700 dark:hover:bg-gray-800">
                          {content}
                        </button>
                      )
                    }

                    return (
                      <a key={route.id} href={destination.href} className="flex items-center justify-between rounded-xl border border-stone-200 px-3 py-2 text-sm hover:bg-stone-50 dark:border-gray-700 dark:hover:bg-gray-800">
                        {content}
                      </a>
                    )
                  })}
                </div>
              </div>
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-stone-500 dark:text-gray-400">Area</p>
                <p className="rounded-xl border border-stone-200 px-3 py-2 text-sm text-stone-700 dark:border-gray-700 dark:text-gray-300">{routeLocationLabel}</p>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={filterModalOpen} onOpenChange={setFilterModalOpen}>
        <DialogContent showCloseButton={false} className="max-w-2xl rounded-[28px] border-stone-200 bg-white p-0 dark:border-gray-800 dark:bg-gray-900">
          <div className="flex items-center justify-between border-b border-stone-200 px-4 py-3 dark:border-gray-800">
            <DialogClose className="rounded-full border border-stone-200 p-2 text-stone-600 dark:border-gray-700 dark:text-gray-300"><X className="size-4" /></DialogClose>
            <DialogTitle className="text-base">Filter climbs</DialogTitle>
            <div className="size-9" />
          </div>
          <div className="max-h-[75vh] overflow-y-auto p-4 pb-24">
            <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4 dark:border-gray-700 dark:bg-gray-800/60">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-semibold text-stone-900 dark:text-gray-100">Grade distribution</p>
                <span className="text-xs text-stone-500 dark:text-gray-400">Median {routeStats.medianGrade ? formatGradeForDisplay(routeStats.medianGrade, gradeSystem) : '—'}</span>
              </div>
              <div className="h-48 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={routeStats.gradeDistribution}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e7e5e4" />
                    <XAxis dataKey="grade" tickFormatter={(value: string) => formatGradeForDisplay(value, gradeSystem)} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip labelFormatter={(value) => typeof value === 'string' ? formatGradeForDisplay(value, gradeSystem) : ''} formatter={(value) => {
                      const count = typeof value === 'number' ? value : Number(value || 0)
                      return [`${count} climbs`, 'Climbs']
                    }} />
                    <Bar dataKey="count" fill="#0f766e" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="text-sm text-stone-700 dark:text-gray-300">
                <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-stone-500 dark:text-gray-400">Min grade</span>
                <select value={minGrade} onChange={(event) => setMinGrade(event.target.value)} className="w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800">
                  <option value="">Any</option>
                  {FILTER_GRADES.map((grade) => <option key={`modal-min-${grade}`} value={grade}>{formatGradeForDisplay(grade, gradeSystem)}</option>)}
                </select>
              </label>
              <label className="text-sm text-stone-700 dark:text-gray-300">
                <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-stone-500 dark:text-gray-400">Max grade</span>
                <select value={maxGrade} onChange={(event) => setMaxGrade(event.target.value)} className="w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800">
                  <option value="">Any</option>
                  {FILTER_GRADES.map((grade) => <option key={`modal-max-${grade}`} value={grade}>{formatGradeForDisplay(grade, gradeSystem)}</option>)}
                </select>
              </label>
            </div>

            <div className="mt-4">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-stone-500 dark:text-gray-400">Climb type</p>
              <div className="flex flex-wrap gap-2">
                {routeTypeChips.map((routeType) => (
                  <button key={routeType} type="button" onClick={() => setSelectedRouteTypes((prev) => prev.includes(routeType) ? prev.filter((item) => item !== routeType) : [...prev, routeType])} className={`rounded-full border px-3 py-1 text-xs font-medium ${selectedRouteTypes.includes(routeType) ? 'border-orange-600 bg-orange-600 text-white' : 'border-stone-300 bg-white text-stone-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200'}`}>
                    {formatRouteTypeLabel(routeType)}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-4">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-stone-500 dark:text-gray-400">Face direction</p>
              <div className="flex flex-wrap gap-2">
                {availableDirections.map((direction) => (
                  <button key={direction} type="button" onClick={() => setSelectedDirections((prev) => prev.includes(direction) ? prev.filter((item) => item !== direction) : [...prev, direction])} className={`rounded-full border px-3 py-1 text-xs font-medium ${selectedDirections.includes(direction) ? 'border-stone-900 bg-stone-900 text-white dark:border-gray-100 dark:bg-gray-100 dark:text-gray-900' : 'border-stone-300 bg-white text-stone-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200'}`}>
                    {direction}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="sticky bottom-0 border-t border-stone-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
            <Button className="w-full" onClick={() => setFilterModalOpen(false)}>Show results</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={sortModalOpen} onOpenChange={setSortModalOpen}>
        <DialogContent showCloseButton={false} className="max-w-sm rounded-[28px] border-stone-200 bg-white p-0 dark:border-gray-800 dark:bg-gray-900">
          <div className="flex items-center justify-between border-b border-stone-200 px-4 py-3 dark:border-gray-800">
            <DialogClose className="rounded-full border border-stone-200 p-2 text-stone-600 dark:border-gray-700 dark:text-gray-300"><X className="size-4" /></DialogClose>
            <DialogTitle className="text-base">Sort climbs</DialogTitle>
            <div className="size-9" />
          </div>
          <div className="p-4 space-y-2">
            <button type="button" onClick={() => { setRouteSort('sends'); setSortModalOpen(false) }} className={`flex w-full items-center justify-between rounded-xl border px-3 py-3 text-sm ${routeSort === 'sends' ? 'border-stone-900 bg-stone-900 text-white' : 'border-stone-200 bg-white text-stone-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200'}`}>
              <span>Ascents</span>
              <ChevronRight className="size-4" />
            </button>
            <button type="button" onClick={() => { setRouteSort('grade'); setSortModalOpen(false) }} className={`flex w-full items-center justify-between rounded-xl border px-3 py-3 text-sm ${routeSort === 'grade' ? 'border-stone-900 bg-stone-900 text-white' : 'border-stone-200 bg-white text-stone-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200'}`}>
              <span>Grade</span>
              <ChevronRight className="size-4" />
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={offlineDialogOpen} onOpenChange={setOfflineDialogOpen}>
        <DialogContent className="border-gray-200 bg-white text-gray-900 dark:border-gray-800 dark:bg-gray-900 dark:text-white">
          <DialogHeader>
            <DialogTitle>{offlinePreview?.existingPack ? 'Update offline crag pack' : 'Download crag offline'}</DialogTitle>
            <DialogDescription className="text-gray-500 dark:text-gray-400">
              Save this crag and its climb topos for offline viewing. Individually saved climbs stay pinned if you remove the crag pack later.
            </DialogDescription>
          </DialogHeader>

          {offlinePreviewLoading && !offlinePreview && (
            <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-6 text-sm text-gray-600 dark:border-gray-800 dark:bg-gray-950/70 dark:text-gray-300">
              Preparing offline pack details...
            </div>
          )}

          {offlinePreview && (
            <div className="space-y-3 text-sm">
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-950/70">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-gray-500 dark:text-gray-400">Climbs</span>
                  <span className="font-medium text-gray-900 dark:text-gray-100">{offlinePreview.manifest.climbCount}</span>
                </div>
                <div className="mt-2 flex items-center justify-between gap-4">
                  <span className="text-gray-500 dark:text-gray-400">Changed climbs</span>
                  <span className="font-medium text-gray-900 dark:text-gray-100">{offlinePreview.changedClimbs}</span>
                </div>
                <div className="mt-2 flex items-center justify-between gap-4">
                  <span className="text-gray-500 dark:text-gray-400">Total size</span>
                  <span className="font-medium text-gray-900 dark:text-gray-100">{formatBytes(offlinePreview.totalBytes)}</span>
                </div>
                <div className="mt-2 flex items-center justify-between gap-4">
                  <span className="text-gray-500 dark:text-gray-400">Cached tiles</span>
                  <span className="font-medium text-gray-900 dark:text-gray-100">{offlinePreview.tileCount}</span>
                </div>
                <div className="mt-2 flex items-center justify-between gap-4">
                  <span className="text-gray-500 dark:text-gray-400">Delta size</span>
                  <span className="font-medium text-gray-900 dark:text-gray-100">{formatBytes(offlinePreview.deltaBytes)}</span>
                </div>
                <div className="mt-2 flex items-center justify-between gap-4">
                  <span className="text-gray-500 dark:text-gray-400">Storage used</span>
                  <span className="font-medium text-gray-900 dark:text-gray-100">{formatBytes(offlinePreview.usageBytes)} of {formatBytes(offlinePreview.budgetBytes)}</span>
                </div>
              </div>

              {offlinePreview.warning && (
                <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
                  {offlinePreview.warning}
                </p>
              )}

              {offlineProgress && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-100">
                  <p className="font-medium">{offlineProgress.completedClimbs} / {offlineProgress.totalClimbs} climbs synced</p>
                  <p className="mt-1 text-sm">{formatBytes(offlineProgress.completedBytes)} / {formatBytes(offlineProgress.totalBytes)} cached</p>
                  <p className="mt-1 text-xs uppercase tracking-wide text-emerald-700 dark:text-emerald-300">{offlineProgress.phase}{offlineProgress.currentClimbName ? ` · ${offlineProgress.currentClimbName}` : ''}{offlinePreview.tileCount > 0 ? ` · ${offlinePreview.tileCount} tiles` : ''}</p>
                </div>
              )}

              {offlinePreview.isUpToDate && !offlineProgress && (
                <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-100">
                  This crag pack is already up to date.
                </p>
              )}

              {overOfflineBudget && (
                <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
                  This update would exceed your 250 MB offline storage budget. Remove another pack first.
                </p>
              )}

              {offlineError && (
                <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-100">
                  {offlineError}
                </p>
              )}
            </div>
          )}

          <DialogFooter>
            {offlinePreview?.existingPack && (
              <Button variant="ghost" onClick={handleRemoveCragOffline} disabled={offlineDialogLoading} className="text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300">
                {offlineDialogLoading ? 'Removing...' : 'Remove offline pack'}
              </Button>
            )}
            <Button variant="outline" onClick={() => setOfflineDialogOpen(false)} disabled={offlineDialogLoading}>Close</Button>
            {offlineError && !offlinePreview && (
              <Button variant="outline" onClick={() => void refreshCragOfflinePreview()} disabled={offlinePreviewLoading || offlineDialogLoading}>
                {offlinePreviewLoading ? 'Retrying...' : 'Retry'}
              </Button>
            )}
            <Button onClick={handleSaveCragOffline} disabled={!canSaveCragOffline}>
              {offlineDialogLoading ? 'Syncing...' : offlinePreview?.existingPack ? 'Update offline pack' : 'Download crag'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
