'use client'

import { MapPin } from 'lucide-react'
import AtlasContextCard from '@/components/submissions/atlas-context-card'
import { LocationSearchBar } from '@/components/editor/location-search-bar'
import type { AtlasAutoSyncResult } from '@/hooks/use-atlas-auto-sync'

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
  return (
    <div className="mb-3 rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900">
      <div className="mb-3 flex items-center gap-2">
        <MapPin className="h-4 w-4 text-gray-500" />
        <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Location details</h2>
      </div>

      <AtlasContextCard result={atlasSync} />

      {canEditCragMetadata ? (
        <div className="mt-3 space-y-3">
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
          Only the submission owner can edit crag and region details.
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
    </div>
  )
}
