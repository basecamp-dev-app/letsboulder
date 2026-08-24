'use client'

import { useMemo } from 'react'
import { useRouter } from 'next/navigation'
import CragMapView from '@/features/crags/components/CragMapView'
import SelectedPinImageTray from '@/features/crags/components/SelectedPinImageTray'
import { CragAccessPanel } from '@/features/crags/components/CragAccessPanel'
import CragRouteSection from '@/features/crags/components/CragRouteSection'
import type { CommunityPlaceInfo } from '@/features/crags/components/CragCommunitySidebar'
import { useCragData } from '@/features/crags/hooks/use-crag-data'
import { useCragPageFilters } from '@/features/crags/hooks/use-crag-page-filters'
import { useCragPageActions } from '@/features/crags/hooks/use-crag-page-actions'
import type { CragPageCrag, CragRoute, ImageData, RouteNavigationTarget, RoutePreview } from '@/features/crags/lib/crag-page-types'
import type { ImageRouteTarget } from '@/features/crags/lib/build-crag-image-destination'
import { useSavedCrag } from '@/features/saved/public-client'

interface CragPageClientProps {
  id: string
  initialCrag?: CragPageCrag | null
  initialImages?: ImageData[]
  initialRoutes?: CragRoute[] | null
  initialRouteImageIdsByClimbId?: Record<string, string[]>
  initialRoutePreviewByClimbId?: Record<string, RoutePreview>
  initialDefaultRouteTargetByImageId?: Record<string, ImageRouteTarget>
  initialRouteNavigationTargetByClimbId?: Record<string, RouteNavigationTarget>
  initialCragCenter?: [number, number] | null
  initialRouteTargetsComplete?: boolean
  initialCriticalImagesComplete?: boolean
  initialMapImagesComplete?: boolean
  initialPayloadLoadedAt?: number
  communityPlace?: CommunityPlaceInfo | null
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
  initialRouteTargetsComplete = false,
  initialCriticalImagesComplete = false,
  initialMapImagesComplete = false,
  initialPayloadLoadedAt,
  communityPlace,
}: CragPageClientProps) {
  const router = useRouter()
  const {
    crag,
    images,
    routes,
    routeImageIdsByClimbId,
    routePreviewByClimbId,
    routeNavigationTargetByClimbId,
    defaultRouteTargetByImageId,
    routesLoadState,
    retryRoutes,
    cragCenter,
    routeTargetsHydrating,
    routeTargetsComplete,
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
    initialRouteTargetsComplete,
    initialCriticalImagesComplete,
    initialMapImagesComplete,
    initialPayloadLoadedAt,
  })

  const routeHrefBase = useMemo(() => {
    const countryCode = crag?.country_code
    const slug = crag?.slug
    if (!countryCode || !slug) return null
    return `/${countryCode.toLowerCase()}/${slug}`
  }, [crag?.country_code, crag?.slug])

  const filters = useCragPageFilters({
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
  })

  const actions = useCragPageActions({
    initialCrag,
  })
  const savedCrag = useSavedCrag(id)

  const handleToggleSaveCrag = async () => {
    if (savedCrag.isAnonymous) {
      router.push(`/auth?redirect_to=${encodeURIComponent(typeof window !== 'undefined' ? window.location.pathname + window.location.search : `/crag/${id}`)}`)
      return
    }

    try {
      const nextSaved = await savedCrag.toggle()
      actions.showToast(nextSaved ? 'Crag saved' : 'Crag removed from saved')
    } catch {
      actions.showToast(savedCrag.isSaved ? 'Failed to remove saved crag' : 'Failed to save crag')
    }
  }

  if (!crag) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-gray-500 dark:text-gray-400">Crag not found</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {actions.toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-blue-600 text-white px-4 py-2 rounded-lg shadow-lg">
          {actions.toast}
        </div>
      )}

      <CragMapView
        crag={crag}
        mapPins={filters.mapPins}
        selectedImageId={filters.selectedImageId}
        cragCenter={cragCenter}
        onPinSelect={filters.setSelectedImageId}
      />

      <SelectedPinImageTray images={filters.selectedPinImages} />

      <div className="mx-auto max-w-[90rem] px-4 pt-4">
        <CragAccessPanel crag={crag} />
      </div>

      <CragRouteSection
        crag={crag}
        cragId={id}
        filteredRoutes={filters.filteredRoutes}
        routesLoadState={routesLoadState}
        highlightedRouteIds={filters.highlightedRouteIds}
        routePreviewDisplayByClimbId={filters.routePreviewDisplayByClimbId}
        routeTargetsHydrating={routeTargetsHydrating}
        routeTargetsComplete={routeTargetsComplete}
        pinNumberByImageId={filters.pinNumberByImageId}
        gradeSystem={filters.gradeSystem}
        routeInsightsUnavailable={filters.routeInsightsUnavailable}
        routeLocationLabel={filters.routeLocationLabel}
        routeStats={filters.routeStats}
        activeRouteFilterChips={filters.activeRouteFilterChips}
        hasActiveRouteFilters={filters.hasActiveRouteFilters}
        selectedImageId={filters.selectedImageId}
        selectedRouteCount={filters.selectedRouteCount}
        routesCount={routes.length}
        onRetryRoutes={() => void retryRoutes()}
        routeSort={filters.routeSort}
        searchQuery={filters.searchQuery}
        searchModalOpen={filters.searchModalOpen}
        filterModalOpen={filters.filterModalOpen}
        sortModalOpen={filters.sortModalOpen}
        cragSwitcherOpen={actions.cragSwitcherOpen}
        cragSwitcherQuery={actions.cragSwitcherQuery}
        cragSwitcherOptions={actions.cragSwitcherOptions}
        saveLoading={savedCrag.isHydrating || savedCrag.isPending}
        saveDisabled={savedCrag.isHydrating || savedCrag.isPending || savedCrag.isError}
        savePendingLabel={savedCrag.isPending ? 'Saving...' : 'Checking...'}
        isSaved={savedCrag.isSaved}
        availableDirections={filters.availableDirections}
        routeTypeChips={filters.routeTypeChips}
        searchModalResults={filters.searchModalResults}
        minGrade={filters.minGrade}
        maxGrade={filters.maxGrade}
        selectedDirections={filters.selectedDirections}
        selectedRouteTypes={filters.selectedRouteTypes}
        onToggleCragSwitcher={() => actions.setCragSwitcherOpen(!actions.cragSwitcherOpen)}
        onCragSwitcherQueryChange={actions.setCragSwitcherQuery}
        onCloseCragSwitcher={() => actions.setCragSwitcherOpen(false)}
        onToggleSaveCrag={() => void handleToggleSaveCrag()}
        onOpenSearchModal={() => filters.setSearchModalOpen(true)}
        onOpenFilterModal={() => filters.setFilterModalOpen(true)}
        onOpenSortModal={() => filters.setSortModalOpen(true)}
        onClearRouteFilters={filters.clearAllRouteFilters}
        onRouteSortChange={filters.handleRouteSortChange}
        onRemoveActiveRouteFilterChip={filters.handleRemoveActiveRouteFilterChip}
        getRouteDestination={filters.getRouteDestination}
        onSearchQueryChange={filters.setSearchQuery}
        onMinGradeChange={filters.setMinGrade}
        onMaxGradeChange={filters.setMaxGrade}
        onToggleDirection={(direction) => {
          const current = filters.selectedDirections
          filters.setSelectedDirections(current.includes(direction) ? current.filter((item) => item !== direction) : [...current, direction])
        }}
        onToggleRouteType={(routeType) => {
          const current = filters.selectedRouteTypes
          filters.setSelectedRouteTypes(current.includes(routeType) ? current.filter((item) => item !== routeType) : [...current, routeType])
        }}
        onSearchModalOpenChange={filters.setSearchModalOpen}
        onFilterModalOpenChange={filters.setFilterModalOpen}
        onSortModalOpenChange={filters.setSortModalOpen}
        communityPlace={communityPlace}
      />
    </div>
  )
}
