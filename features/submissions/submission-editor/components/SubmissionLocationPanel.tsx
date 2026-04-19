'use client'

import { useState } from 'react'
import AtlasContextCard from '@/features/submissions/components/AtlasContextCard'
import { CollapsiblePanel } from '@/features/submissions/components/editor/CollapsiblePanel'
import { LocationSearchBar } from '@/features/submissions/components/editor/LocationSearchBar'
import type { AtlasAutoSyncResult } from '@/features/submissions/editor/location/use-atlas-auto-sync'

interface SubmissionLocationPanelProps {
  atlasSync: AtlasAutoSyncResult
  canEditCragMetadata: boolean
  cragName: string
  onCragNameChange: (value: string) => void
  regionTag: string
  onRegionTagChange: (value: string) => void
  subArea: string
  onSubAreaChange: (value: string) => void
  latitude: string
  onLatitudeChange: (value: string) => void
  longitude: string
  onLongitudeChange: (value: string) => void
  searchQuery: string
  onSearchQueryChange: (value: string) => void
  onSearchLocation: () => void
  searchingLocation: boolean
  locationSearchError: string | null
}

export function SubmissionLocationPanel({
  atlasSync,
  canEditCragMetadata,
  cragName,
  onCragNameChange,
  regionTag,
  onRegionTagChange,
  subArea,
  onSubAreaChange,
  latitude,
  onLatitudeChange,
  longitude,
  onLongitudeChange,
  searchQuery,
  onSearchQueryChange,
  onSearchLocation,
  searchingLocation,
  locationSearchError,
}: SubmissionLocationPanelProps) {
  const [open, setOpen] = useState(false)

  return (
    <CollapsiblePanel
      title="Location details"
      subtitle="Crag metadata, image coordinates, and location search."
      open={open}
      onToggle={() => setOpen((value) => !value)}
    >
      <AtlasContextCard result={atlasSync} />

      {canEditCragMetadata ? (
        <div className="mt-3 space-y-3">
          <p className="text-xs text-amber-700 dark:text-amber-300">
            High-risk metadata edits are blocked automatically. Suspicious edits may be flagged for review.
          </p>
          <label className="text-xs text-gray-600 dark:text-gray-300">
            Crag name
            <input
              value={cragName}
              onChange={(event) => onCragNameChange(event.target.value)}
              placeholder="e.g. Leaning Tower"
              className="mt-1 w-full rounded-md border border-gray-300 px-2 py-2 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
            />
          </label>
          <label className="text-xs text-gray-600 dark:text-gray-300">
            Region tag
            <input
              value={regionTag}
              onChange={(event) => onRegionTagChange(event.target.value)}
              placeholder="e.g. Yosemite Valley"
              className="mt-1 w-full rounded-md border border-gray-300 px-2 py-2 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
            />
          </label>
          <label className="text-xs text-gray-600 dark:text-gray-300">
            Sub-area (optional)
            <input
              value={subArea}
              onChange={(event) => onSubAreaChange(event.target.value)}
              placeholder="e.g. Valley S Side"
              className="mt-1 w-full rounded-md border border-gray-300 px-2 py-2 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
            />
          </label>
        </div>
      ) : (
        <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
          Sign in to edit crag and region details. High-risk metadata edits are blocked automatically.
        </p>
      )}

      <div className="mt-3 space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-300">Image location</h3>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <label className="text-xs text-gray-600 dark:text-gray-300">
            Latitude
            <input
              value={latitude}
              onChange={(event) => onLatitudeChange(event.target.value)}
              placeholder="e.g. 48.4049"
              className="mt-1 w-full rounded-md border border-gray-300 px-2 py-2 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
            />
          </label>
          <label className="text-xs text-gray-600 dark:text-gray-300">
            Longitude
            <input
              value={longitude}
              onChange={(event) => onLongitudeChange(event.target.value)}
              placeholder="e.g. 2.6920"
              className="mt-1 w-full rounded-md border border-gray-300 px-2 py-2 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
            />
          </label>
        </div>

        <LocationSearchBar
          query={searchQuery}
          onQueryChange={onSearchQueryChange}
          onSearch={onSearchLocation}
          searching={searchingLocation}
          error={locationSearchError}
        />
      </div>
    </CollapsiblePanel>
  )
}
