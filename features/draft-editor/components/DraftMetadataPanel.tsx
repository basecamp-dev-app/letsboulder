'use client'

import { MapPin } from 'lucide-react'
import MapLibreLocationPicker from '@/components/map/MapLibreLocationPicker'
import { AtlasContextCard } from '@/features/submissions/public-client'
import { parseOptionalCoordinate } from '@/features/submissions/public-client'
import { CragSelector } from '@/features/submissions/public-client'
import { SectorSelector } from '@/features/submissions/public-client'
import { LocationSearchBar } from '@/features/submissions/public-client'
import type { AtlasAutoSyncResult } from '@/features/submissions/public-client'

interface DraftMetadataPanelProps {
  atlasSync: AtlasAutoSyncResult
  selectedCrag: { id: string; name: string; latitude: number | null; longitude: number | null } | null
  showCragSelector: boolean
  cragId: string | null
  sectorId: string | null
  activeImageLocationMode: 'shared' | 'custom'
  activeDraftImageId: string | null
  latitude: string
  longitude: string
  customGpsByImageId: Record<string, { latitude: number | null; longitude: number | null }>
  effectiveMarkerPosition: [number, number] | null
  mapOpen: boolean
  searchQuery: string
  searchingLocation: boolean
  locationSearchError: string | null
  routeType: string
  onShowCragSelector: (show: boolean) => void
  onSelectCrag: (crag: { id: string; name: string; latitude: number | null; longitude: number | null }) => void
  onCreateCrag: (crag: { id: string; name: string; latitude: number; longitude: number }) => void
  onSectorChange: (sectorId: string | null) => void
  onLocationModeChange: (mode: 'shared' | 'custom') => void
  onLatitudeChange: (value: string) => void
  onLongitudeChange: (value: string) => void
  onCustomGpsChange: (imageId: string, gps: { latitude: number | null; longitude: number | null }) => void
  onMapPositionChange: (position: { latitude: number; longitude: number }) => void
  onMapOpenChange: (open: boolean) => void
  onSearchQueryChange: (value: string) => void
  onSearchLocation: () => void
  onRouteTypeChange: (routeType: string) => void
}

export function DraftMetadataPanel({
  atlasSync,
  selectedCrag,
  showCragSelector,
  cragId,
  sectorId,
  activeImageLocationMode,
  activeDraftImageId,
  latitude,
  longitude,
  customGpsByImageId,
  effectiveMarkerPosition,
  mapOpen,
  searchQuery,
  searchingLocation,
  locationSearchError,
  routeType,
  onShowCragSelector,
  onSelectCrag,
  onCreateCrag,
  onSectorChange,
  onLocationModeChange,
  onLatitudeChange,
  onLongitudeChange,
  onCustomGpsChange,
  onMapPositionChange,
  onMapOpenChange,
  onSearchQueryChange,
  onSearchLocation,
  onRouteTypeChange,
}: DraftMetadataPanelProps) {
  return (
    <div className="mb-2 rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900">
      <AtlasContextCard result={atlasSync} />
      <div className="mt-3">
        <div className="mb-3 flex items-center gap-2">
          <MapPin className="h-4 w-4 text-gray-500" />
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Draft metadata</h2>
        </div>

        <div className="mb-3 rounded-md border border-gray-200 bg-gray-50 px-3 py-3 dark:border-gray-700 dark:bg-gray-800/60">
          {selectedCrag && !showCragSelector ? (
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{selectedCrag.name}</p>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  {typeof selectedCrag.latitude === 'number' && Number.isFinite(selectedCrag.latitude)
                    && typeof selectedCrag.longitude === 'number' && Number.isFinite(selectedCrag.longitude)
                    && (selectedCrag.latitude !== 0 || selectedCrag.longitude !== 0)
                    ? `${selectedCrag.latitude.toFixed(4)}, ${selectedCrag.longitude.toFixed(4)}`
                    : 'Crag selected'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onShowCragSelector(true)}
                className="text-xs font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
              >
                Change
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-sm text-gray-700 dark:text-gray-200">Select an existing crag or create a new one.</p>
              {!showCragSelector ? (
                <button
                  type="button"
                  onClick={() => onShowCragSelector(true)}
                  className="inline-flex rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
                >
                  Select crag
                </button>
              ) : null}
            </div>
          )}
        </div>

        {showCragSelector ? (
          <div className="mb-3">
            <CragSelector
              selectedCragId={cragId}
              latitude={selectedCrag ? selectedCrag.latitude : (effectiveMarkerPosition?.[0] ?? (latitude ? parseFloat(latitude) : null))}
              longitude={selectedCrag ? selectedCrag.longitude : (effectiveMarkerPosition?.[1] ?? (longitude ? parseFloat(longitude) : null))}
              onSelect={(crag) => {
                onSelectCrag({
                  id: crag.id,
                  name: crag.name,
                  latitude: crag.latitude,
                  longitude: crag.longitude,
                })
              }}
              onCreateNew={(crag) => {
                onCreateCrag({
                  id: crag.id,
                  name: crag.name,
                  latitude: crag.latitude ?? 0,
                  longitude: crag.longitude ?? 0,
                })
              }}
            />
          </div>
        ) : null}

        {selectedCrag && !showCragSelector ? (
          <div className="mb-3 rounded-md border border-gray-200 bg-gray-50 px-3 py-3 dark:border-gray-700 dark:bg-gray-800/60">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-300">Sector</h3>
            <SectorSelector
              cragId={cragId}
              value={sectorId}
              onChange={onSectorChange}
              placeholder="Select sector (optional)"
            />
          </div>
        ) : null}

        <div className="mb-3 rounded-md border border-gray-200 bg-gray-50 px-3 py-3 dark:border-gray-700 dark:bg-gray-800/60">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-300">Image location</h3>
          <div className="mb-3 inline-flex rounded-lg border border-gray-200 p-1 dark:border-gray-700">
            <button
              type="button"
              onClick={() => onLocationModeChange('shared')}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${activeImageLocationMode === 'shared' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800'}`}
            >
              Submission location
            </button>
            <button
              type="button"
              onClick={() => onLocationModeChange('custom')}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${activeImageLocationMode === 'custom' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800'}`}
            >
              This image only
            </button>
          </div>
          <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">
            {'`Submission location` uses the same pin as any other image assigned to the draft-level location. `This image only` keeps its own exact coordinates.'}
          </p>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <label className="text-xs text-gray-600 dark:text-gray-300">
              Latitude
              <input
                value={activeImageLocationMode === 'custom' && activeDraftImageId ? String(customGpsByImageId[activeDraftImageId]?.latitude ?? '') : latitude}
                onChange={(event) => {
                  if (activeImageLocationMode === 'custom' && activeDraftImageId) {
                    const nextLatitude = event.target.value
                    onCustomGpsChange(activeDraftImageId, {
                        latitude: parseOptionalCoordinate(nextLatitude),
                      longitude: customGpsByImageId[activeDraftImageId]?.longitude ?? null,
                    })
                    return
                  }
                  onLatitudeChange(event.target.value)
                }}
                placeholder="e.g. 48.4049"
                className="mt-1 w-full rounded-md border border-gray-300 px-2 py-2 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
              />
            </label>
            <label className="text-xs text-gray-600 dark:text-gray-300">
              Longitude
              <input
                value={activeImageLocationMode === 'custom' && activeDraftImageId ? String(customGpsByImageId[activeDraftImageId]?.longitude ?? '') : longitude}
                onChange={(event) => {
                  if (activeImageLocationMode === 'custom' && activeDraftImageId) {
                    const nextLongitude = event.target.value
                    onCustomGpsChange(activeDraftImageId, {
                      latitude: customGpsByImageId[activeDraftImageId]?.latitude ?? null,
                        longitude: parseOptionalCoordinate(nextLongitude),
                    })
                    return
                  }
                  onLongitudeChange(event.target.value)
                }}
                placeholder="e.g. 2.6920"
                className="mt-1 w-full rounded-md border border-gray-300 px-2 py-2 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
              />
            </label>
          </div>

          {mapOpen ? (
            <div className="mt-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs text-gray-500 dark:text-gray-400">Click map or drag marker to adjust location</p>
                <button
                  type="button"
                  onClick={() => onMapOpenChange(false)}
                  className="text-xs font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                >
                  Done
                </button>
              </div>
              <div className="h-72 overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
                <MapLibreLocationPicker
                  value={effectiveMarkerPosition ? { latitude: effectiveMarkerPosition[0], longitude: effectiveMarkerPosition[1] } : null}
                  className="h-full w-full"
                  onChange={onMapPositionChange}
                />
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => onMapOpenChange(true)}
              className="mt-3 w-full rounded-md border border-gray-300 bg-gray-50 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
            >
              Adjust location on map
            </button>
          )}

          <LocationSearchBar
            query={searchQuery}
            onQueryChange={onSearchQueryChange}
            onSearch={onSearchLocation}
            searching={searchingLocation}
            error={locationSearchError}
          />
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <label className="text-xs text-gray-600 dark:text-gray-300">
            Route type default
            <select
              value={routeType}
              onChange={(event) => onRouteTypeChange(event.target.value)}
              className="mt-1 w-full rounded-md border border-gray-300 px-2 py-2 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
            >
              <option value="sport">Sport</option>
              <option value="boulder">Boulder</option>
              <option value="trad">Trad</option>
              <option value="deep-water-solo">Deep water solo</option>
            </select>
          </label>
        </div>
      </div>
    </div>
  )
}
