'use client'

import React, { type MouseEvent } from 'react'
import CragPageToolbar, { type CragSwitcherOption } from '@/features/crags/components/CragPageToolbar'
import CragCommunitySidebar from '@/features/crags/components/CragCommunitySidebar'
import CragRouteList from '@/features/crags/components/CragRouteList'
import CragSearchDialog from '@/features/crags/components/CragSearchDialog'
import CragFilterDialog from '@/features/crags/components/CragFilterDialog'
import CragActiveFilterChips from '@/features/crags/components/CragActiveFilterChips'
import CragSortDialog from '@/features/crags/components/CragSortDialog'
import CragOfflineDialog from '@/features/crags/components/CragOfflineDialog'
import type { ActiveRouteFilterChip, ResolvedRouteDestination } from '@/features/crags/lib/crag-page-domain'
import type { CragPageCrag, CragRoute, RoutePreview } from '@/features/crags/lib/crag-page-types'
import type { GradeSystem } from '@/lib/grades'
import type { OfflineJobProgressEvent } from '@/lib/offline/sw-messages'
import type { getCragOfflinePreview } from '@/lib/offline/packs'

interface CragRouteSectionProps {
  crag: CragPageCrag
  filteredRoutes: CragRoute[]
  routesLoadState: 'idle' | 'loading' | 'loaded' | 'error'
  highlightedRouteIds: Set<string>
  routePreviewDisplayByClimbId: Record<string, RoutePreview>
  pinNumberByImageId: Map<string, number>
  gradeSystem: GradeSystem
  routeInsightsUnavailable: boolean
  routeLocationLabel: string
  routeStats: ReturnType<typeof import('@/features/crags/lib/crag-route-filters').buildCragRouteStats>
  activeRouteFilterChips: ActiveRouteFilterChip[]
  hasActiveRouteFilters: boolean
  selectedImageId: string | null
  selectedRouteCount: number
  routesCount: number
  routeSort: 'sends' | 'rating' | 'grade' | 'name'
  searchQuery: string
  searchModalOpen: boolean
  filterModalOpen: boolean
  sortModalOpen: boolean
  cragSwitcherOpen: boolean
  cragSwitcherQuery: string
  cragSwitcherOptions: CragSwitcherOption[]
  canDownloadCrag: boolean
  offlineDialogLoading: boolean
  offlinePreviewLoading: boolean
  offlineDialogOpen: boolean
  offlinePreview: Awaited<ReturnType<typeof getCragOfflinePreview>> | null
  offlineProgress: OfflineJobProgressEvent | null
  offlineError: string | null
  overOfflineBudget: boolean
  canSaveCragOffline: boolean
  availableDirections: string[]
  routeTypeChips: string[]
  searchModalResults: CragRoute[]
  minGrade: string
  maxGrade: string
  selectedDirections: string[]
  selectedRouteTypes: string[]
  onToggleCragSwitcher: () => void
  onCragSwitcherQueryChange: (value: string) => void
  onCloseCragSwitcher: () => void
  onOpenOfflineDialog: () => void
  onOpenSearchModal: () => void
  onOpenFilterModal: () => void
  onOpenSortModal: () => void
  onClearRouteFilters: () => void
  onRouteSortChange: (sort: 'sends' | 'grade') => void
  onRemoveActiveRouteFilterChip: (chip: ActiveRouteFilterChip) => void
  onPendingRouteNavigation: (event: MouseEvent<HTMLButtonElement>, route: CragRoute) => void
  getRouteDestination: (route: CragRoute) => ResolvedRouteDestination
  onSearchQueryChange: (query: string) => void
  onMinGradeChange: (grade: string) => void
  onMaxGradeChange: (grade: string) => void
  onToggleDirection: (direction: string) => void
  onToggleRouteType: (routeType: string) => void
  onOfflineDialogClose: () => void
  onOfflineDialogRetry: () => void
  onOfflineDialogRemove: () => void
  onOfflineDialogSave: () => void
  onSearchModalOpenChange: (open: boolean) => void
  onFilterModalOpenChange: (open: boolean) => void
  onSortModalOpenChange: (open: boolean) => void
  onOfflineDialogOpenChange: (open: boolean) => void
  communityPlaceSlug: string | null | undefined
}

const CragRouteSection = React.memo(function CragRouteSection({
  crag,
  filteredRoutes,
  routesLoadState,
  highlightedRouteIds,
  routePreviewDisplayByClimbId,
  pinNumberByImageId,
  gradeSystem,
  routeInsightsUnavailable,
  routeLocationLabel,
  routeStats,
  activeRouteFilterChips,
  hasActiveRouteFilters,
  selectedImageId,
  selectedRouteCount,
  routesCount,
  routeSort,
  searchQuery,
  searchModalOpen,
  filterModalOpen,
  sortModalOpen,
  cragSwitcherOpen,
  cragSwitcherQuery,
  cragSwitcherOptions,
  canDownloadCrag,
  offlineDialogLoading,
  offlinePreviewLoading,
  offlineDialogOpen,
  offlinePreview,
  offlineProgress,
  offlineError,
  overOfflineBudget,
  canSaveCragOffline,
  availableDirections,
  routeTypeChips,
  searchModalResults,
  minGrade,
  maxGrade,
  selectedDirections,
  selectedRouteTypes,
  onToggleCragSwitcher,
  onCragSwitcherQueryChange,
  onCloseCragSwitcher,
  onOpenOfflineDialog,
  onOpenSearchModal,
  onOpenFilterModal,
  onOpenSortModal,
  onClearRouteFilters,
  onRouteSortChange,
  onRemoveActiveRouteFilterChip,
  onPendingRouteNavigation,
  getRouteDestination,
  onSearchQueryChange,
  onMinGradeChange,
  onMaxGradeChange,
  onToggleDirection,
  onToggleRouteType,
  onOfflineDialogClose,
  onOfflineDialogRetry,
  onOfflineDialogRemove,
  onOfflineDialogSave,
  onSearchModalOpenChange,
  onFilterModalOpenChange,
  onSortModalOpenChange,
  onOfflineDialogOpenChange,
  communityPlaceSlug,
}: CragRouteSectionProps) {
  return (
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
          routesCount={routesCount}
          onToggleCragSwitcher={onToggleCragSwitcher}
          onCragSwitcherQueryChange={onCragSwitcherQueryChange}
          onCloseCragSwitcher={onCloseCragSwitcher}
          onOpenOfflineDialog={onOpenOfflineDialog}
          onOpenSearchModal={onOpenSearchModal}
          onOpenFilterModal={onOpenFilterModal}
          onOpenSortModal={onOpenSortModal}
          onClearRouteFilters={onClearRouteFilters}
        />

        <div className="space-y-4">
          {routeInsightsUnavailable ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-100">
              Route intelligence is unavailable right now. Crag stats and sorting signals will appear again once the route metrics query is reachable.
            </div>
          ) : null}
          <CragActiveFilterChips chips={activeRouteFilterChips} onRemoveChip={onRemoveActiveRouteFilterChip} />

          <CragRouteList
            filteredRoutes={filteredRoutes}
            routesLoadState={routesLoadState}
            highlightedRouteIds={highlightedRouteIds}
            routePreviewDisplayByClimbId={routePreviewDisplayByClimbId}
            pinNumberByImageId={pinNumberByImageId}
            gradeSystem={gradeSystem}
            onPendingRouteNavigation={onPendingRouteNavigation}
            getRouteDestination={getRouteDestination}
          />
        </div>
      </section>

      <CragCommunitySidebar communityPlaceSlug={communityPlaceSlug} />

      <CragSearchDialog
        open={searchModalOpen}
        onOpenChange={onSearchModalOpenChange}
        searchQuery={searchQuery}
        onSearchQueryChange={onSearchQueryChange}
        searchModalResults={searchModalResults}
        routeLocationLabel={routeLocationLabel}
        gradeSystem={gradeSystem}
        getRouteDestination={getRouteDestination}
        onPendingRouteNavigation={onPendingRouteNavigation}
      />

      <CragFilterDialog
        open={filterModalOpen}
        onOpenChange={onFilterModalOpenChange}
        routeStats={routeStats}
        gradeSystem={gradeSystem}
        minGrade={minGrade}
        maxGrade={maxGrade}
        onMinGradeChange={onMinGradeChange}
        onMaxGradeChange={onMaxGradeChange}
        routeTypeChips={routeTypeChips}
        selectedRouteTypes={selectedRouteTypes}
        onToggleRouteType={onToggleRouteType}
        availableDirections={availableDirections}
        selectedDirections={selectedDirections}
        onToggleDirection={onToggleDirection}
      />

      <CragSortDialog
        open={sortModalOpen}
        onOpenChange={onSortModalOpenChange}
        routeSort={routeSort}
        onRouteSortChange={onRouteSortChange}
      />

      <CragOfflineDialog
        open={offlineDialogOpen}
        onOpenChange={onOfflineDialogOpenChange}
        offlineDialogLoading={offlineDialogLoading}
        offlinePreviewLoading={offlinePreviewLoading}
        offlinePreview={offlinePreview}
        offlineProgress={offlineProgress}
        offlineError={offlineError}
        overOfflineBudget={overOfflineBudget}
        canSaveCragOffline={canSaveCragOffline}
        onClose={onOfflineDialogClose}
        onRetry={onOfflineDialogRetry}
        onRemove={onOfflineDialogRemove}
        onSave={onOfflineDialogSave}
      />
    </div>
  )
})

export default CragRouteSection
