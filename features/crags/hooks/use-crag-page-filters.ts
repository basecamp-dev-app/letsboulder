'use client'

import { useCallback, useMemo, useState } from 'react'
import type { MouseEvent } from 'react'
import { useRouter } from 'next/navigation'
import type { LightweightCragMapPin } from '@/lib/lightweight-crag-map-types'
import { useGradeSystem } from '@/lib/grades/preferences'
import { formatGradeForDisplay } from '@/lib/grade-display'
import { buildCragImageDestination } from '@/features/crags/lib/build-crag-image-destination'
import { buildActiveRouteFilterChips, buildCragRouteSummaries, buildRouteNavigationDisplayByClimbId, buildRoutePreviewDisplayByClimbId, filterAndSortCragRoutes, getSearchModalResults, resolveCragRouteDestination, sortImagesByViewCenter } from '@/features/crags/lib/crag-page-domain'
import type { ActiveRouteFilterChip, CragRouteStats, ResolvedRouteDestination } from '@/features/crags/lib/crag-page-domain'
import type { CragPageCrag, CragRoute, ImageData, RouteNavigationTarget, RoutePreview, SelectedPinImage } from '@/features/crags/lib/crag-page-types'
import type { ImageRouteTarget } from '@/features/crags/lib/build-crag-image-destination'

interface ClusteredImageData {
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

interface LocatedClusteredImageData extends ClusteredImageData {
  latitude: number
  longitude: number
}

interface CragImageClusterModel {
  imageById: Map<string, ClusteredImageData>
  clusteredPins: {
    clusterIdByImageId: Map<string, string>
    clusterById: Map<string, { id: string; images: Array<{ id: string }> }>
    clusters: Array<{ id: string; images: Array<{ id: string }> }>
  }
  mapPins: LightweightCragMapPin[]
  pinNumberByImageId: Map<string, number>
  clusterImageIdsByClusterId: Map<string, string[]>
}

function buildCragImageClusterModel(orderedImages: ImageData[]): CragImageClusterModel {
  const imageById = new Map<string, ClusteredImageData>()
  const locatedImagesByClusterId = new Map<string, LocatedClusteredImageData[]>()

  for (const image of orderedImages) {
    imageById.set(image.id, image as ClusteredImageData)

    if (typeof image.latitude !== 'number' || typeof image.longitude !== 'number') continue
    const clusterId = `${image.latitude.toFixed(6)}:${image.longitude.toFixed(6)}`
    const existing = locatedImagesByClusterId.get(clusterId)
    if (existing) {
      existing.push(image as LocatedClusteredImageData)
      continue
    }
    locatedImagesByClusterId.set(clusterId, [image as LocatedClusteredImageData])
  }

  const clusters: Array<{ id: string; images: Array<{ id: string }> }> = []
  const mapPins: LightweightCragMapPin[] = []
  const clusterIdByImageId = new Map<string, string>()
  const clusterById = new Map<string, { id: string; images: Array<{ id: string }> }>()
  const pinNumberByImageId = new Map<string, number>()
  const clusterImageIdsByClusterId = new Map<string, string[]>()
  let pinNumber = 1

  for (const [clusterId, groupedImages] of locatedImagesByClusterId.entries()) {
    const clusterImageIds: string[] = []
    const clusterImages = groupedImages.map((image) => {
      clusterIdByImageId.set(image.id, clusterId)
      pinNumberByImageId.set(image.id, pinNumber)
      clusterImageIds.push(image.id)
      return { id: image.id }
    })

    const cluster = { id: clusterId, images: clusterImages }
    clusters.push(cluster)
    clusterById.set(clusterId, cluster)
    clusterImageIdsByClusterId.set(clusterId, clusterImageIds)

    const primaryImage = groupedImages[0]
    mapPins.push({
      id: clusterId,
      latitude: primaryImage.latitude,
      longitude: primaryImage.longitude,
      label: String(groupedImages.length),
      activeImageIds: clusterImageIds,
      primaryImageId: primaryImage.id,
    })

    pinNumber += 1
  }

  return {
    imageById,
    clusteredPins: {
      clusterIdByImageId,
      clusterById,
      clusters,
    },
    mapPins,
    pinNumberByImageId,
    clusterImageIdsByClusterId,
  }
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
  initialSelectedImageId?: string | null
}

export interface UseCragPageFiltersResult {
  selectedImageId: string | null
  setSelectedImageId: (id: string | null) => void
  routeSort: 'sends' | 'rating' | 'grade' | 'name'
  handleRouteSortChange: (sort: 'sends' | 'rating' | 'grade' | 'name') => void
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
  clusteredPins: {
    clusterIdByImageId: Map<string, string>
    clusterById: Map<string, { id: string; images: Array<{ id: string }> }>
    clusters: Array<{ id: string; images: Array<{ id: string }> }>
  }
  mapPins: LightweightCragMapPin[]
  pinNumberByImageId: Map<string, number>
  selectedImageIds: Set<string>
  selectedPinImages: SelectedPinImage[]
  highlightedRouteIds: Set<string>
  selectedRouteCount: number
  routePreviewDisplayByClimbId: Record<string, RoutePreview>
  routeNavigationDisplayByClimbId: Record<string, RouteNavigationTarget>
  routeTypeChips: string[]
  availableDirections: string[]
  filteredRoutes: CragRoute[]
  routeStats: CragRouteStats
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
  initialSelectedImageId = null,
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
  const [selectedImageId, setSelectedImageId] = useState<string | null>(initialSelectedImageId)

  const viewCenter = cragCenter

  const orderedImages = useMemo(() => sortImagesByViewCenter(images, viewCenter), [images, viewCenter])
  const imageClusterModel = useMemo(() => buildCragImageClusterModel(orderedImages), [orderedImages])
  const { imageById, clusteredPins, mapPins, pinNumberByImageId, clusterImageIdsByClusterId } = imageClusterModel

  const routePreviewDisplayByClimbId = useMemo(() => buildRoutePreviewDisplayByClimbId(routePreviewByClimbId, imageById), [imageById, routePreviewByClimbId])

  const routeNavigationDisplayByClimbId = useMemo(() => buildRouteNavigationDisplayByClimbId(routeNavigationTargetByClimbId, imageById), [imageById, routeNavigationTargetByClimbId])

  const selectedImageIds = useMemo(() => {
    if (!selectedImageId) return new Set<string>()

    const selectedClusterId = clusteredPins.clusterIdByImageId.get(selectedImageId)
    if (!selectedClusterId) return new Set([selectedImageId])

    const clusterImageIds = clusterImageIdsByClusterId.get(selectedClusterId)
    if (!clusterImageIds) return new Set([selectedImageId])

    return new Set(clusterImageIds)
  }, [clusterImageIdsByClusterId, clusteredPins.clusterIdByImageId, selectedImageId])

  const routeSelectionModel = useMemo(() => {
    const highlightedRouteIds = new Set<string>()
    const selectedPinRouteCountByImageId = new Map<string, number>()

    if (!selectedImageId) {
      return {
        highlightedRouteIds,
        selectedRouteCount: 0,
        selectedPinRouteCountByImageId,
      }
    }

    let selectedRouteCount = 0

    for (const route of routes) {
      const navigationImageId = routeNavigationDisplayByClimbId[route.id]?.displayImageId
      const previewImageId = routePreviewDisplayByClimbId[route.id]?.imageId

      let selectedRouteImageId: string | null = null
      if (navigationImageId && selectedImageIds.has(navigationImageId)) {
        selectedRouteImageId = navigationImageId
      } else if (previewImageId && selectedImageIds.has(previewImageId)) {
        selectedRouteImageId = previewImageId
      } else {
        const routeImageIds = routeImageIdsByClimbId[route.id] || []
        for (const imageId of routeImageIds) {
          if (!selectedImageIds.has(imageId)) continue
          selectedRouteImageId = imageId
          break
        }
      }

      if (!selectedRouteImageId) continue

      highlightedRouteIds.add(route.id)
      selectedRouteCount += 1
      selectedPinRouteCountByImageId.set(selectedRouteImageId, (selectedPinRouteCountByImageId.get(selectedRouteImageId) || 0) + 1)
    }

    return {
      highlightedRouteIds,
      selectedRouteCount,
      selectedPinRouteCountByImageId,
    }
  }, [routeImageIdsByClimbId, routeNavigationDisplayByClimbId, routePreviewDisplayByClimbId, routes, selectedImageId, selectedImageIds])

  const { highlightedRouteIds, selectedRouteCount, selectedPinRouteCountByImageId } = routeSelectionModel

  const selectedPinImages = useMemo(() => {
    if (!selectedImageId) return []

    const offlineOnly = typeof navigator !== 'undefined' && navigator.onLine === false
    return orderedImages
      .filter((image) => selectedImageIds.has(image.id))
      .map((image) => {
        const mappedRouteCount = selectedPinRouteCountByImageId.get(image.id)
        const routeLinesCount = mappedRouteCount ?? image.route_lines_count

        return {
          id: image.id,
          url: image.url,
          routeLinesCount,
          href: buildCragImageDestination({
            imageId: image.id,
            target: defaultRouteTargetByImageId[image.id],
            routeHrefBase,
            offlineOnly,
          }),
          isSelected: image.id === selectedImageId,
          hasRoutes: routeLinesCount > 0,
        }
      })
  }, [defaultRouteTargetByImageId, orderedImages, routeHrefBase, selectedImageId, selectedImageIds, selectedPinRouteCountByImageId])

  const routeSummaries = useMemo(() => buildCragRouteSummaries(routes), [routes])
  const { routeTypeChips, availableDirections, routeStats } = routeSummaries

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

  const handleRouteSortChange = useCallback((sort: 'sends' | 'rating' | 'grade' | 'name') => {
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
    selectedPinImages,
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
