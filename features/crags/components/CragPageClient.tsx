'use client'

import { useMemo } from 'react'
import CragMapView from '@/features/crags/components/CragMapView'
import CragRouteSection from '@/features/crags/components/CragRouteSection'
import type { CommunityPlaceInfo } from '@/features/crags/components/CragCommunitySidebar'
import { useCragData } from '@/features/crags/hooks/use-crag-data'
import { useCragPageFilters } from '@/features/crags/hooks/use-crag-page-filters'
import { useCragPageActions } from '@/features/crags/hooks/use-crag-page-actions'
import type { CragPageCrag, CragRoute, ImageData, RouteNavigationTarget, RoutePreview } from '@/features/crags/lib/crag-page-types'
import type { ImageRouteTarget } from '@/features/crags/lib/build-crag-image-destination'

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
  initialImagesComplete?: boolean
  initialPayloadLoadedAt?: number
  communityPlace?: CommunityPlaceInfo | null
  initialSelectedImageId?: string | null
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
  initialImagesComplete = false,
  initialPayloadLoadedAt,
  communityPlace,
  initialSelectedImageId = null,
}: CragPageClientProps) {
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
    initialImagesComplete,
    initialPayloadLoadedAt,
  })

  const routeHrefBase = useMemo(() => {
    const countryCode = crag?.country_code
    const slug = crag?.slug
    if (!countryCode || !slug) return null
    return `/${countryCode.toLowerCase()}/${slug}`
  }, [crag])

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
    initialSelectedImageId,
  })

  const actions = useCragPageActions({
    id,
    initialCrag,
  })

  if (!crag) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-gray-500 dark:text-gray-400">Crag not found</div>
      </div>
    )
  }

  const canDownloadCrag = !actions.offlineDialogLoading

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
        isAdmin={actions.isAdmin}
        isFlagging={actions.isFlagging}
        onPinSelect={filters.setSelectedImageId}
        onFlagCrag={actions.handleFlagCrag}
      />

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
        canDownloadCrag={canDownloadCrag}
        offlineDialogLoading={actions.offlineDialogLoading}
        offlinePreviewLoading={actions.offlinePreviewLoading}
        offlineDialogOpen={actions.offlineDialogOpen}
        offlinePreview={actions.offlinePreview}
        offlineProgress={actions.offlineProgress}
        offlineError={actions.offlineError}
        overOfflineBudget={actions.overOfflineBudget}
        canSaveCragOffline={actions.canSaveCragOffline}
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
        onOpenOfflineDialog={actions.handleOpenOfflineDialog}
        onOpenSearchModal={() => filters.setSearchModalOpen(true)}
        onOpenFilterModal={() => filters.setFilterModalOpen(true)}
        onOpenSortModal={() => filters.setSortModalOpen(true)}
        onClearRouteFilters={filters.clearAllRouteFilters}
        onRouteSortChange={filters.handleRouteSortChange}
        onRemoveActiveRouteFilterChip={filters.handleRemoveActiveRouteFilterChip}
        onPendingRouteNavigation={filters.handlePendingRouteNavigation}
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
        onOfflineDialogClose={() => actions.setOfflineDialogOpen(false)}
        onOfflineDialogRetry={() => void actions.refreshCragOfflinePreview()}
        onOfflineDialogRemove={() => void actions.handleRemoveCragOffline()}
        onOfflineDialogSave={() => void actions.handleSaveCragOffline()}
        onSearchModalOpenChange={filters.setSearchModalOpen}
        onFilterModalOpenChange={filters.setFilterModalOpen}
        onSortModalOpenChange={filters.setSortModalOpen}
        onOfflineDialogOpenChange={actions.setOfflineDialogOpen}
        communityPlace={communityPlace}
      />
    </div>
  )
}
