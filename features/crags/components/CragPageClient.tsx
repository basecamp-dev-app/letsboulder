
'use client'

import { useCallback, useEffect, useMemo, useState, startTransition } from 'react'
import type { MouseEvent } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { csrfFetch } from '@/hooks/useCsrf'
import { useGradeSystem } from '@/features/grades/hooks/useGradeSystem'
import { formatGradeForDisplay } from '@/lib/grade-display'
import CragPageToolbar, { type CragSwitcherOption } from '@/features/crags/components/CragPageToolbar'
import CragCommunitySidebar from '@/features/crags/components/CragCommunitySidebar'
import CragPageSkeleton from '@/features/crags/components/CragPageSkeleton'
import CragRouteList from '@/features/crags/components/CragRouteList'
import CragSearchDialog from '@/features/crags/components/CragSearchDialog'
import CragFilterDialog from '@/features/crags/components/CragFilterDialog'
import CragActiveFilterChips from '@/features/crags/components/CragActiveFilterChips'
import CragOfflineDialog from '@/features/crags/components/CragOfflineDialog'
import CragSortDialog from '@/features/crags/components/CragSortDialog'
import { useCragData } from '@/features/crags/hooks/use-crag-data'
import { buildActiveRouteFilterChips, buildCragRouteStats, buildRouteNavigationDisplayByClimbId, buildRoutePreviewDisplayByClimbId, filterAndSortCragRoutes, getAvailableDirections, getHighlightedRouteIds, getOfflineCragState, getSearchModalResults, getSelectedImageIds, getRouteTypeChips, resolveCragRouteDestination, sortImagesByViewCenter, sortPinClusters } from '@/features/crags/lib/crag-page-domain'
import type { ActiveRouteFilterChip, ResolvedRouteDestination } from '@/features/crags/lib/crag-page-domain'
import LightweightCragMap from '@/components/lightweight-crag-map'
import type { ImageRouteTarget } from '@/features/crags/lib/build-crag-image-destination'
import type { OfflineJobProgressEvent } from '@/lib/offline/sw-messages'
import { getCragOfflinePreview, removeCragOffline, saveCragOffline } from '@/lib/offline/packs'
import { buildCragPinClusters, type ClusterableCragImage } from '@/lib/crag-pin-clusters'
import type { Crag, CragRoute, ImageData, RouteNavigationTarget, RoutePreview } from '@/features/crags/lib/crag-page-types'

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

  const {
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
  } = useCragData({
    id,
    initialCrag,
    initialImages,
    initialRoutes,
    initialRouteImageIdsByClimbId,
    initialRoutePreviewByClimbId,
    initialDefaultRouteTargetByImageId,
    initialRouteNavigationTargetByClimbId,
    initialCragCenter,
    initialPayloadLoadedAt,
  })

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

    async function loadAdminStatus() {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return

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

  const selectedImageIds = useMemo(() => getSelectedImageIds(selectedImageId, clusteredPins), [clusteredPins, selectedImageId])

  const highlightedRouteIds = useMemo(() => getHighlightedRouteIds(
    routes,
    selectedImageId,
    selectedImageIds,
    routeImageIdsByClimbId,
    routePreviewDisplayByClimbId,
    routeNavigationDisplayByClimbId
  ), [routeImageIdsByClimbId, routeNavigationDisplayByClimbId, routePreviewDisplayByClimbId, routes, selectedImageIds, selectedImageId])

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

  const activeRouteFilterChips = useMemo(() => buildActiveRouteFilterChips({
    selectedImageId,
    minGrade,
    maxGrade,
    minRating,
    minSends,
    searchQuery,
    selectedDirections,
    selectedRouteTypes,
    topoOnly,
  }, (grade) => formatGradeForDisplay(grade, gradeSystem)), [gradeSystem, maxGrade, minGrade, minRating, minSends, searchQuery, selectedDirections, selectedRouteTypes, selectedImageId, topoOnly])

  const handleRemoveActiveRouteFilterChip = useCallback((chip: ActiveRouteFilterChip) => {
    if (chip.key === 'min-grade') {
      setMinGrade('')
      return
    }
    if (chip.key === 'max-grade') {
      setMaxGrade('')
      return
    }
    if (chip.key === 'min-rating') {
      setMinRating('')
      return
    }
    if (chip.key === 'min-sends') {
      setMinSends('')
      return
    }
    if (chip.key === 'search') {
      setSearchQuery('')
      return
    }
    if (chip.key === 'topo-only') {
      setTopoOnly(false)
      return
    }
    if (chip.key.startsWith('direction-')) {
      const direction = chip.key.replace('direction-', '')
      setSelectedDirections((prev) => prev.filter((item) => item !== direction))
      return
    }
    if (chip.key.startsWith('route-type-')) {
      const routeType = chip.key.replace('route-type-', '')
      setSelectedRouteTypes((prev) => prev.filter((item) => item !== routeType))
    }
  }, [])

  const handleRouteSortChange = useCallback((sort: 'sends' | 'grade') => {
    setRouteSort(sort)
    setSortModalOpen(false)
  }, [])

  const getRouteDestination = useCallback((route: CragRoute): ResolvedRouteDestination => {
    const offlineOnly = typeof navigator !== 'undefined' && navigator.onLine === false
    const destination = resolveCragRouteDestination(
      route,
      routeNavigationDisplayByClimbId,
      routePreviewDisplayByClimbId,
      defaultRouteTargetByImageId,
      routeHrefBase,
      offlineOnly
    )
    if (!destination.ready) {
      console.warn(`[Router Debug] Route target miss for climb_id: ${route.id}. Falling back to slug.`)
    }
    return destination
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

  const { overOfflineBudget, canSaveCragOffline } = useMemo(() => getOfflineCragState(
    offlinePreview,
    offlineDialogLoading,
    offlinePreviewLoading
  ), [offlineDialogLoading, offlinePreview, offlinePreviewLoading])

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
            <CragActiveFilterChips chips={activeRouteFilterChips} onRemoveChip={handleRemoveActiveRouteFilterChip} />

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

      <CragSearchDialog
        open={searchModalOpen}
        onOpenChange={setSearchModalOpen}
        searchQuery={searchQuery}
        onSearchQueryChange={setSearchQuery}
        searchModalResults={searchModalResults}
        routeLocationLabel={routeLocationLabel}
        gradeSystem={gradeSystem}
        getRouteDestination={getRouteDestination}
        onPendingRouteNavigation={handlePendingRouteNavigation}
      />

      <CragFilterDialog
        open={filterModalOpen}
        onOpenChange={setFilterModalOpen}
        routeStats={routeStats}
        gradeSystem={gradeSystem}
        minGrade={minGrade}
        maxGrade={maxGrade}
        onMinGradeChange={setMinGrade}
        onMaxGradeChange={setMaxGrade}
        routeTypeChips={routeTypeChips}
        selectedRouteTypes={selectedRouteTypes}
        onToggleRouteType={(routeType) => setSelectedRouteTypes((prev) => prev.includes(routeType) ? prev.filter((item) => item !== routeType) : [...prev, routeType])}
        availableDirections={availableDirections}
        selectedDirections={selectedDirections}
        onToggleDirection={(direction) => setSelectedDirections((prev) => prev.includes(direction) ? prev.filter((item) => item !== direction) : [...prev, direction])}
      />

      <CragSortDialog
        open={sortModalOpen}
        onOpenChange={setSortModalOpen}
        routeSort={routeSort}
        onRouteSortChange={handleRouteSortChange}
      />

      <CragOfflineDialog
        open={offlineDialogOpen}
        onOpenChange={setOfflineDialogOpen}
        offlineDialogLoading={offlineDialogLoading}
        offlinePreviewLoading={offlinePreviewLoading}
        offlinePreview={offlinePreview}
        offlineProgress={offlineProgress}
        offlineError={offlineError}
        overOfflineBudget={overOfflineBudget}
        canSaveCragOffline={canSaveCragOffline}
        onClose={() => setOfflineDialogOpen(false)}
        onRetry={() => void refreshCragOfflinePreview()}
        onRemove={() => void handleRemoveCragOffline()}
        onSave={() => void handleSaveCragOffline()}
      />
    </div>
  )
}
