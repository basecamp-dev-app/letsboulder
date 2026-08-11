'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { CragMetadataProposalDialog } from '@/features/crags/public-client'
import AtlasContextCard from '@/features/submissions/components/AtlasContextCard'
import { CollapsiblePanel } from '@/features/submissions/components/editor/CollapsiblePanel'
import { LocationSearchBar } from '@/features/submissions/components/editor/LocationSearchBar'
import type { AtlasAutoSyncResult } from '@/features/submissions/editor/location/use-atlas-auto-sync'

interface SubmissionLocationPanelProps {
  atlasSync: AtlasAutoSyncResult
  canProposeCragMetadata: boolean
  cragId: string | null
  sourceImageId: string | null
  cragName: string
  regionTag: string
  subArea: string
  onProposalSubmitted: () => void
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
  canProposeCragMetadata,
  cragId,
  sourceImageId,
  cragName,
  regionTag,
  subArea,
  onProposalSubmitted,
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
  const [proposalOpen, setProposalOpen] = useState(false)

  return (
    <CollapsiblePanel
      title="Location details"
      subtitle="Shared crag details, image coordinates, and location search."
      open={open}
      onToggle={() => setOpen((value) => !value)}
    >
      <AtlasContextCard result={atlasSync} />

      <div className="mt-3 rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-900/60">
        <div className="grid gap-3 text-sm sm:grid-cols-3">
          <div><p className="text-xs text-gray-500">Crag</p><p className="font-medium">{cragName || 'Unknown'}</p></div>
          <div><p className="text-xs text-gray-500">Region</p><p className="font-medium">{regionTag || 'Unknown'}</p></div>
          <div><p className="text-xs text-gray-500">Sub-area</p><p className="font-medium">{subArea || 'None'}</p></div>
        </div>
        {canProposeCragMetadata && cragId ? (
          <Button className="mt-3" onClick={() => setProposalOpen(true)} size="sm" variant="outline">Propose a correction</Button>
        ) : null}
      </div>

      {cragId ? (
        <CragMetadataProposalDialog
          cragId={cragId}
          currentName={cragName}
          currentRegionName={regionTag}
          currentSubArea={subArea}
          onOpenChange={setProposalOpen}
          onSubmitted={onProposalSubmitted}
          open={proposalOpen}
          sourceImageId={sourceImageId || undefined}
        />
      ) : null}

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
