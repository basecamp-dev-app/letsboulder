'use client'

import React from 'react'
import CragPageToolbar, { type CragSwitcherOption } from '@/features/crags/components/CragPageToolbar'
import CragCommunitySidebar, { type CommunityPlaceInfo } from '@/features/crags/components/CragCommunitySidebar'
import CragRouteList from '@/features/crags/components/CragRouteList'
import CragSearchDialog from '@/features/crags/components/CragSearchDialog'
import CragFilterDialog from '@/features/crags/components/CragFilterDialog'
import CragActiveFilterChips from '@/features/crags/components/CragActiveFilterChips'
import CragSortDialog from '@/features/crags/components/CragSortDialog'
import type { ActiveRouteFilterChip, ResolvedRouteDestination } from '@/features/crags/lib/crag-page-domain'
import type { CragPageCrag, CragRoute, RoutePreview } from '@/features/crags/lib/crag-page-types'
import type { GradeSystem } from '@/lib/grades'

interface CragRouteSectionProps {
  cragId: string
  crag: CragPageCrag
  filteredRoutes: CragRoute[]
  routesLoadState: 'idle' | 'loading' | 'loaded' | 'error'
  highlightedRouteIds: Set<string>
  routePreviewDisplayByClimbId: Record<string, RoutePreview>
  routeTargetsHydrating: boolean
  routeTargetsComplete: boolean
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
  onRetryRoutes: () => void
  routeSort: 'sends' | 'rating' | 'grade' | 'name'
  searchQuery: string
  searchModalOpen: boolean
  filterModalOpen: boolean
  sortModalOpen: boolean
  cragSwitcherOpen: boolean
  cragSwitcherQuery: string
  cragSwitcherOptions: CragSwitcherOption[]
  saveLoading: boolean
  isSaved: boolean
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
  onToggleSaveCrag: () => void
  onOpenSearchModal: () => void
  onOpenFilterModal: () => void
  onOpenSortModal: () => void
  onClearRouteFilters: () => void
  onRouteSortChange: (sort: 'sends' | 'rating' | 'grade' | 'name') => void
  onRemoveActiveRouteFilterChip: (chip: ActiveRouteFilterChip) => void
  getRouteDestination: (route: CragRoute) => ResolvedRouteDestination
  onSearchQueryChange: (query: string) => void
  onMinGradeChange: (grade: string) => void
  onMaxGradeChange: (grade: string) => void
  onToggleDirection: (direction: string) => void
  onToggleRouteType: (routeType: string) => void
  onSearchModalOpenChange: (open: boolean) => void
  onFilterModalOpenChange: (open: boolean) => void
  onSortModalOpenChange: (open: boolean) => void
  communityPlace: CommunityPlaceInfo | null | undefined
}

const CragRouteSection = React.memo(function CragRouteSection({
  cragId,
  crag,
  filteredRoutes,
  routesLoadState,
  highlightedRouteIds,
  routePreviewDisplayByClimbId,
  routeTargetsHydrating,
  routeTargetsComplete,
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
  onRetryRoutes,
  routeSort,
  searchQuery,
  searchModalOpen,
  filterModalOpen,
  sortModalOpen,
  cragSwitcherOpen,
  cragSwitcherQuery,
  cragSwitcherOptions,
  saveLoading,
  isSaved,
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
  onToggleSaveCrag,
  onOpenSearchModal,
  onOpenFilterModal,
  onOpenSortModal,
  onClearRouteFilters,
  onRouteSortChange,
  onRemoveActiveRouteFilterChip,
  getRouteDestination,
  onSearchQueryChange,
  onMinGradeChange,
  onMaxGradeChange,
  onToggleDirection,
  onToggleRouteType,
  onSearchModalOpenChange,
  onFilterModalOpenChange,
  onSortModalOpenChange,
  communityPlace,
}: CragRouteSectionProps) {
  const placeLabel = communityPlace?.type === 'gym' ? 'Gym' : 'Crag'

  return (
    <div className="relative mx-auto max-w-[90rem] space-y-5 px-4 py-4 lg:space-y-6 lg:py-5">
      <section className="grid gap-4 lg:grid-cols-[minmax(0,0.56fr)_minmax(0,1fr)] lg:items-start lg:gap-5">
        <div className="rounded-[28px] border border-stone-200/90 bg-white px-4 py-4 shadow-sm shadow-stone-950/5 dark:border-gray-800 dark:bg-gray-900 lg:px-5 lg:py-5">
          <div className="border-b border-stone-100 pb-3 dark:border-gray-800">
            <h2 className="text-sm font-semibold text-stone-900 dark:text-gray-100">{placeLabel} community</h2>
          </div>
          <div className="pt-3">
            <CragCommunitySidebar cragId={cragId} communityPlace={communityPlace} />
          </div>
        </div>

        <div className="space-y-3 rounded-[28px] border border-stone-200/90 bg-white px-4 py-4 shadow-sm shadow-stone-950/5 dark:border-gray-800 dark:bg-gray-900 lg:px-5 lg:py-5">
          <CragPageToolbar
            crag={crag}
            cragSwitcherOpen={cragSwitcherOpen}
            cragSwitcherQuery={cragSwitcherQuery}
            cragSwitcherOptions={cragSwitcherOptions}
            saveLoading={saveLoading}
            isSaved={isSaved}
            hasActiveRouteFilters={hasActiveRouteFilters}
            selectedImageId={selectedImageId}
            selectedRouteCount={selectedRouteCount}
            routesCount={routesCount}
            onToggleCragSwitcher={onToggleCragSwitcher}
            onCragSwitcherQueryChange={onCragSwitcherQueryChange}
            onCloseCragSwitcher={onCloseCragSwitcher}
            onToggleSaveCrag={onToggleSaveCrag}
            onOpenSearchModal={onOpenSearchModal}
            onOpenFilterModal={onOpenFilterModal}
            onOpenSortModal={onOpenSortModal}
            onClearRouteFilters={onClearRouteFilters}
          />
          {routeInsightsUnavailable ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-100">
              Route intelligence is unavailable right now. Crag stats and sorting signals will appear again once the route metrics query is reachable.
            </div>
          ) : null}
          <CragActiveFilterChips chips={activeRouteFilterChips} onRemoveChip={onRemoveActiveRouteFilterChip} />
        </div>
      </section>

      <section>
        <CragRouteList
          cragId={cragId}
          filteredRoutes={filteredRoutes}
          routesLoadState={routesLoadState}
          highlightedRouteIds={highlightedRouteIds}
          routePreviewDisplayByClimbId={routePreviewDisplayByClimbId}
          routeTargetsHydrating={routeTargetsHydrating}
          routeTargetsComplete={routeTargetsComplete}
          pinNumberByImageId={pinNumberByImageId}
          gradeSystem={gradeSystem}
            routesCount={routesCount}
            hasActiveRouteFilters={hasActiveRouteFilters}
            onClearRouteFilters={onClearRouteFilters}
            onRetryRoutes={onRetryRoutes}
            getRouteDestination={getRouteDestination}
          />
      </section>

      <CragSearchDialog
        cragId={cragId}
        open={searchModalOpen}
        onOpenChange={onSearchModalOpenChange}
        searchQuery={searchQuery}
        onSearchQueryChange={onSearchQueryChange}
        searchModalResults={searchModalResults}
        routeLocationLabel={routeLocationLabel}
        gradeSystem={gradeSystem}
        getRouteDestination={getRouteDestination}
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
    </div>
  )
})

export default CragRouteSection
