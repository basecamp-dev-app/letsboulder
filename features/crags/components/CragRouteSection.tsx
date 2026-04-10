'use client'

import React, { type MouseEvent, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import CragPageToolbar, { type CragSwitcherOption } from '@/features/crags/components/CragPageToolbar'
import CragCommunitySidebar, { type CommunityPlaceInfo } from '@/features/crags/components/CragCommunitySidebar'
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
  cragId: string
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
  communityPlace: CommunityPlaceInfo | null | undefined
}

const CragRouteSection = React.memo(function CragRouteSection({
  cragId,
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
  communityPlace,
}: CragRouteSectionProps) {
  const [communityOpen, setCommunityOpen] = useState(false)
  const [hasOpenedCommunity, setHasOpenedCommunity] = useState(false)

  const placeLabel = communityPlace?.type === 'gym' ? 'Gym' : 'Crag'

  return (
    <div className="relative max-w-5xl mx-auto px-4 py-4 space-y-6">
      <div className="rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
          <button
            type="button"
            onClick={() => {
              if (!communityOpen) {
                setHasOpenedCommunity(true)
              }
              setCommunityOpen(!communityOpen)
            }}
            className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
            aria-expanded={communityOpen}
          >
            <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{placeLabel} community</h2>
            <ChevronDown className={`h-4 w-4 shrink-0 text-gray-500 transition-transform dark:text-gray-400 ${communityOpen ? 'rotate-180' : ''}`} />
          </button>
          {communityOpen && hasOpenedCommunity && (
            <div className="border-t border-gray-200 px-4 pb-4 dark:border-gray-800">
              <CragCommunitySidebar cragId={cragId} communityPlace={communityPlace} />
            </div>
          )}
        </div>

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
