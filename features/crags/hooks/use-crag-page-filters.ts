'use client'

import { useCallback, useMemo, useState } from 'react'
import type { MouseEvent } from 'react'
import { useRouter } from 'next/navigation'
import { useGradeSystem } from '@/features/grades/hooks/useGradeSystem'
import { formatGradeForDisplay } from '@/lib/grade-display'
import { buildActiveRouteFilterChips, buildCragRouteStats, buildRouteNavigationDisplayByClimbId, buildRoutePreviewDisplayByClimbId, filterAndSortCragRoutes, getAvailableDirections, getHighlightedRouteIds, getSearchModalResults, getSelectedImageIds, getRouteTypeChips, resolveCragRouteDestination, sortImagesByViewCenter, sortPinClusters } from '@/features/crags/lib/crag-page-domain'
import type { ActiveRouteFilterChip, ResolvedRouteDestination } from '@/features/crags/lib/crag-page-domain'
import { buildCragPinClusters, type ClusterableCragImage } from '@/lib/crag-pin-clusters'
import type { CragPageCrag, CragRoute, ImageData, RouteNavigationTarget, RoutePreview } from '@/features/crags/lib/crag-page-types'
import type { ImageRouteTarget } from '@/features/crags/lib/build-crag-image-destination'

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

export interface UseCragPageFiltersParams {
  crag: CragPageCrag | null
  images: ImageData[]
  routes: CragRoute[]
  routeImageIdsByClimbId: Record<string, string[]>
  routePreviewByClimbId: Record<string, RoutePreview>
  routeNavigationTargetByClimbId: Record<string, RouteNavigationTarget>
  defaultRouteTargetByImageId: Record<string, ImageRouteTarget>
  cragCenter: [number, number] | null
  routeHrefBase: string | null
  routesLoadState: 'idle' | 'loading' | 'loaded' | 'error'
}

export interface UseCragPageFiltersResult {
  selectedImageId: string | null
  setSelectedImageId: (id: string | null) => void
  routeSort: 'sends' | 'rating' | 'grade' | 'name'
  handleRouteSortChange: (sort: 'sends' | 'grade') => void
  sortModalOpen: boolean
  setSortModalOpen: (open: boolean) => void
  searchQuery: string
  setSearchQuery: (query: string) => void
  searchModalOpen: boolean
  setSearchModalOpen: (open: boolean) => void
  filterModalOpen: boolean
  setFilterModalOpen: (open: boolean) => void
  minGrade: string
  setMinGrade: (grade: string) => void
  maxGrade: string
  setMaxGrade: (grade: string) => void
  minRating: string
  setMinRating: (rating: string) => void
  minSends: string
  setMinSends: (sends: string) => void
  selectedDirections: string[]
  setSelectedDirections: (directions: string[]) => void
  selectedRouteTypes: string[]
  setSelectedRouteTypes: (types: string[]) => void
  topoOnly: boolean
  setTopoOnly: (value: boolean) => void
  viewCenter: [number, number] | null
  orderedImages: ImageData[]
  imageById: Map<string, ClusteredImageData>
  clusteredPins: ReturnType<typeof buildCragPinClusters>
  mapPins: Array<{ id: string; latitude: number; longitude: number; label: string }>
  pinNumberByImageId: Map<string, number>
  selectedImageIds: Set<string>
  highlightedRouteIds: Set<string>
  selectedRouteCount: number
  routePreviewDisplayByClimbId: Record<string, RoutePreview>
  routeNavigationDisplayByClimbId: Record<string, RouteNavigationTarget>
  routeTypeChips: string[]
  availableDirections: string[]
  filteredRoutes: CragRoute[]
  routeStats: ReturnType<typeof buildCragRouteStats>
  routeInsightsUnavailable: boolean
  routeLocationLabel: string
  searchModalResults: CragRoute[]
  activeRouteFilterChips: ActiveRouteFilterChip[]
  handleRemoveActiveRouteFilterChip: (chip: ActiveRouteFilterChip) => void
  clearAllRouteFilters: () => void
  hasActiveRouteFilters: boolean
  getRouteDestination: (route: CragRoute) => ResolvedRouteDestination
  handlePendingRouteNavigation: (event: MouseEvent<HTMLButtonElement>, route: CragRoute) => void
  gradeSystem: ReturnType<typeof useGradeSystem>
}

export function useCragPageFilters({
  crag,
  images,
  routes,
  routeImageIdsByClimbId,
  routePreviewByClimbId,
  routeNavigationTargetByClimbId,
  defaultRouteTargetByImageId,
  cragCenter,
  routeHrefBase,
  routesLoadState,
}: UseCragPageFiltersParams): UseCragPageFiltersResult {
  const router = useRouter()
  const gradeSystem = useGradeSystem()

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
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null)

  const viewCenter = cragCenter

  const orderedImages = useMemo(() => sortImagesByViewCenter(images, viewCenter), [images, viewCenter])

  const imageById = useMemo(() => new Map(orderedImages.map((image) => [image.id, image as ClusteredImageData])), [orderedImages])

  const clusteredPins = useMemo(() => buildCragPinClusters(orderedImages as ClusteredImageData[], 6), [orderedImages])

  const orderedPinClusters = useMemo(() => sortPinClusters(
    clusteredPins.clusters.map((cluster) => ({ ...cluster, badgeNumber: 0 })),
    viewCenter
  ), [clusteredPins.clusters, viewCenter])

  const mapPins = useMemo(() => orderedPinClusters.map((cluster) => ({
    id: cluster.representativeImageId,
    latitude: cluster.latitude,
    longitude: cluster.longitude,
    label: String(cluster.badgeNumber),
  })), [orderedPinClusters])

  const pinNumberByImageId = useMemo(() => {
    const mapping = new Map<string, number>()
    orderedPinClusters.forEach((cluster) => {
      cluster.images.forEach((image: ClusteredImageData) => {
        mapping.set(image.id, cluster.badgeNumber)
      })
    })
    return mapping
  }, [orderedPinClusters])

  const routePreviewDisplayByClimbId = useMemo(() => buildRoutePreviewDisplayByClimbId(routePreviewByClimbId, imageById), [imageById, routePreviewByClimbId])

  const routeNavigationDisplayByClimbId = useMemo(() => buildRouteNavigationDisplayByClimbId(routeNavigationTargetByClimbId, imageById), [imageById, routeNavigationTargetByClimbId])

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

  const routeTypeChips = useMemo(() => getRouteTypeChips(routes), [routes])

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

  const hasActiveRouteFilters = useMemo(() => Boolean(
    selectedImageId || minGrade || maxGrade || minRating || minSends || searchQuery.trim() || selectedDirections.length > 0 || selectedRouteTypes.length > 0 || topoOnly
  ), [maxGrade, minGrade, minRating, minSends, searchQuery, selectedDirections.length, selectedRouteTypes.length, selectedImageId, topoOnly])

  const availableDirections = useMemo(() => getAvailableDirections(routes), [routes])

  const filteredRoutes = useMemo(() => filterAndSortCragRoutes(routes, highlightedRouteIds, routeSort, {
    selectedImageId,
    minGrade,
    maxGrade,
    minRating,
    minSends,
    searchQuery,
    selectedDirections,
    selectedRouteTypes,
    topoOnly,
  }), [highlightedRouteIds, maxGrade, minGrade, minRating, minSends, routeSort, routes, searchQuery, selectedDirections, selectedImageId, selectedRouteTypes, topoOnly])

  const routeStats = useMemo(() => buildCragRouteStats(routes), [routes])

  const routeInsightsUnavailable = routesLoadState === 'error'
  const routeLocationLabel = crag?.sub_area || crag?.region_name || crag?.climbing_areas?.name || 'Area details pending'

  const searchModalResults = useMemo(() => getSearchModalResults(routes, searchQuery), [routes, searchQuery])

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
    if (chip.key === 'min-grade') { setMinGrade(''); return }
    if (chip.key === 'max-grade') { setMaxGrade(''); return }
    if (chip.key === 'min-rating') { setMinRating(''); return }
    if (chip.key === 'min-sends') { setMinSends(''); return }
    if (chip.key === 'search') { setSearchQuery(''); return }
    if (chip.key === 'topo-only') { setTopoOnly(false); return }
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

  return {
    selectedImageId,
    setSelectedImageId,
    routeSort,
    handleRouteSortChange,
    sortModalOpen,
    setSortModalOpen,
    searchQuery,
    setSearchQuery,
    searchModalOpen,
    setSearchModalOpen,
    filterModalOpen,
    setFilterModalOpen,
    minGrade,
    setMinGrade,
    maxGrade,
    setMaxGrade,
    minRating,
    setMinRating,
    minSends,
    setMinSends,
    selectedDirections,
    setSelectedDirections,
    selectedRouteTypes,
    setSelectedRouteTypes,
    topoOnly,
    setTopoOnly,
    viewCenter,
    orderedImages,
    imageById,
    clusteredPins,
    mapPins,
    pinNumberByImageId,
    selectedImageIds,
    highlightedRouteIds,
    selectedRouteCount,
    routePreviewDisplayByClimbId,
    routeNavigationDisplayByClimbId,
    routeTypeChips,
    availableDirections,
    filteredRoutes,
    routeStats,
    routeInsightsUnavailable,
    routeLocationLabel,
    searchModalResults,
    activeRouteFilterChips,
    handleRemoveActiveRouteFilterChip,
    clearAllRouteFilters,
    hasActiveRouteFilters,
    getRouteDestination,
    handlePendingRouteNavigation,
    gradeSystem,
  }
}
