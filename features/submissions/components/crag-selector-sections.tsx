'use client'

import type { SubmissionCrag } from '@/features/submissions/lib/submission-types'

interface CragSearchResult extends SubmissionCrag {
  distance?: number | null
}

interface NearbyCragResult extends SubmissionCrag {
  distance?: number | null
}

interface LocationTagSearchResult {
  id: string
  kind: 'region' | 'sub_area'
  name: string
  country_code: string | null
}

interface NearbyCragsSectionProps {
  latitude?: number | null
  longitude?: number | null
  showCreate: boolean
  showNearby: boolean
  nearbyLoading: boolean
  nearbyCrags: NearbyCragResult[]
  selectedCragId?: string | null
  onToggleNearby: () => void
  onSelect: (crag: SubmissionCrag) => void
}

export function NearbyCragsSection({
  latitude,
  longitude,
  showCreate,
  showNearby,
  nearbyLoading,
  nearbyCrags,
  selectedCragId,
  onToggleNearby,
  onSelect,
}: NearbyCragsSectionProps) {
  if (showCreate || latitude == null || longitude == null) return null

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-900">Nearby crags</p>
          <p className="text-xs text-slate-500">Use one nearby or create a new crag at this location.</p>
        </div>
        <button
          type="button"
          onClick={onToggleNearby}
          className="text-xs font-medium text-blue-600 hover:text-blue-700"
        >
          {showNearby ? 'Hide nearby' : 'Show nearby'}
        </button>
      </div>
      {showNearby ? (
        <div className="mt-3 space-y-2">
          {nearbyLoading ? <p className="text-sm text-slate-500">Loading nearby crags...</p> : null}
          {!nearbyLoading && nearbyCrags.length === 0 ? (
            <p className="text-sm text-slate-500">No nearby crags found within the current search area.</p>
          ) : null}
          {nearbyCrags.map((crag) => {
            const isSelected = selectedCragId === crag.id
            return (
              <button
                key={crag.id}
                type="button"
                onClick={() => onSelect(crag)}
                className={`flex w-full items-start justify-between rounded-lg border px-3 py-2 text-left transition ${isSelected ? 'border-blue-500 bg-blue-50' : 'border-slate-200 bg-white hover:border-blue-300 hover:bg-slate-50'}`}
              >
                <div>
                  <p className="text-sm font-medium text-slate-900">{crag.name}</p>
                  <p className="text-xs text-slate-500">
                    {typeof crag.distance === 'number' ? `${Math.round(crag.distance)}m away` : 'Nearby crag'}
                  </p>
                </div>
                {isSelected ? <span className="text-xs font-semibold text-blue-600">Selected</span> : null}
              </button>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}

interface SearchResultsSectionProps {
  showCreate: boolean
  query: string
  loading: boolean
  results: CragSearchResult[]
  selectedCragId?: string | null
  onOpenCreate: () => void
  onSelect: (crag: SubmissionCrag) => void
}

export function SearchResultsSection({
  showCreate,
  query,
  loading,
  results,
  selectedCragId,
  onOpenCreate,
  onSelect,
}: SearchResultsSectionProps) {
  if (showCreate) return null

  const hasQuery = query.trim().length >= 2

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-slate-900">Search results</p>
        <button
          type="button"
          onClick={onOpenCreate}
          className="inline-flex rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
        >
          Create new crag
        </button>
      </div>

      {hasQuery && !loading && results.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-4 text-sm text-slate-600">
          No existing crags match this search.
        </div>
      ) : null}

      {results.length > 0 ? (
        <div className="space-y-2">
          {results.map((crag) => {
            const isSelected = selectedCragId === crag.id
            return (
              <button
                key={crag.id}
                type="button"
                onClick={() => onSelect(crag)}
                className={`flex w-full items-start justify-between rounded-lg border px-3 py-2 text-left transition ${isSelected ? 'border-blue-500 bg-blue-50' : 'border-slate-200 bg-white hover:border-blue-300 hover:bg-slate-50'}`}
              >
                <div>
                  <p className="text-sm font-medium text-slate-900">{crag.name}</p>
                  <p className="text-xs text-slate-500">
                    {crag.regionName || crag.subArea || 'Existing crag'}
                    {typeof crag.distance === 'number' ? ` • ${Math.round(crag.distance)}m away` : ''}
                  </p>
                </div>
                {isSelected ? <span className="text-xs font-semibold text-blue-600">Selected</span> : null}
              </button>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}

interface CreateCragSectionProps {
  showCreate: boolean
  newCragName: string
  newCragRegionTag: string
  newCragSubArea: string
  newCragRockType: string
  regionTagLoading: boolean
  regionTagResults: LocationTagSearchResult[]
  successMessage: string
  canCreate: boolean
  isCreating: boolean
  setNewCragName: (value: string) => void
  setNewCragRegionTag: (value: string) => void
  setNewCragSubArea: (value: string) => void
  setNewCragRockType: (value: string) => void
  onPickRegion: (name: string) => void
  onCancel: () => void
  onCreate: () => void
}

export function CreateCragSection({
  showCreate,
  newCragName,
  newCragRegionTag,
  newCragSubArea,
  newCragRockType,
  regionTagLoading,
  regionTagResults,
  successMessage,
  canCreate,
  isCreating,
  setNewCragName,
  setNewCragRegionTag,
  setNewCragSubArea,
  setNewCragRockType,
  onPickRegion,
  onCancel,
  onCreate,
}: CreateCragSectionProps) {
  if (!showCreate) return null

  return (
    <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-900">Create new crag</p>
          <p className="text-xs text-slate-500">Create a crag at the current draft location.</p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="text-xs font-medium text-slate-600 hover:text-slate-800"
        >
          Cancel
        </button>
      </div>

      <label className="block text-xs font-medium text-slate-700">
        Crag name
        <input
          value={newCragName}
          onChange={(event) => setNewCragName(event.target.value)}
          placeholder="e.g. Harrison's Rocks"
          className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
        />
      </label>

      <label className="block text-xs font-medium text-slate-700">
        Region tag
        <input
          value={newCragRegionTag}
          onChange={(event) => setNewCragRegionTag(event.target.value)}
          placeholder="e.g. Southern Sandstone"
          className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
        />
      </label>

      {regionTagLoading ? <p className="text-xs text-slate-500">Searching regions...</p> : null}
      {regionTagResults.length > 0 ? (
        <div className="space-y-1 rounded-md border border-slate-200 bg-white p-2">
          {regionTagResults.map((tag) => (
            <button
              key={tag.id}
              type="button"
              onClick={() => onPickRegion(tag.name)}
              className="block w-full rounded px-2 py-1 text-left text-sm text-slate-700 hover:bg-slate-100"
            >
              {tag.name}
            </button>
          ))}
        </div>
      ) : null}

      <label className="block text-xs font-medium text-slate-700">
        Sub-area
        <input
          value={newCragSubArea}
          onChange={(event) => setNewCragSubArea(event.target.value)}
          placeholder="Optional"
          className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
        />
      </label>

      <label className="block text-xs font-medium text-slate-700">
        Rock type
        <input
          value={newCragRockType}
          onChange={(event) => setNewCragRockType(event.target.value)}
          placeholder="Optional"
          className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
        />
      </label>

      {successMessage ? <p className="text-sm text-emerald-700">{successMessage}</p> : null}

      <button
        type="button"
        onClick={onCreate}
        disabled={!canCreate || isCreating}
        className="inline-flex rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isCreating ? 'Creating...' : 'Create crag'}
      </button>
    </div>
  )
}
