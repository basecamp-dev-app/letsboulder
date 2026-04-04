'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import type { SubmissionCrag } from '@/features/submissions/lib/submission-types'
import { csrfFetch } from '@/hooks/useCsrf'
import { reportError } from '@/lib/errors'
import { useAtlasAutoSync } from '@/features/submissions/editor/location/use-atlas-auto-sync'
import AtlasContextCard from '@/features/submissions/components/atlas-context-card'

interface CragSelectorProps {
  latitude?: number | null
  longitude?: number | null
  onSelect: (crag: SubmissionCrag) => void
  onCreateNew?: (crag: SubmissionCrag) => void
  selectedCragId?: string | null
}

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

export default function CragSelector({
  latitude,
  longitude,
  onSelect,
  onCreateNew,
  selectedCragId
}: CragSelectorProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<CragSearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [newCragName, setNewCragName] = useState('')
  const [newCragRegionTag, setNewCragRegionTag] = useState('')
  const [newCragSubArea, setNewCragSubArea] = useState('')
  const [newCragRockType, setNewCragRockType] = useState('')
  const [regionTagResults, setRegionTagResults] = useState<LocationTagSearchResult[]>([])
  const [regionTagLoading, setRegionTagLoading] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [successMessage, setSuccessMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [showNearby, setShowNearby] = useState(false)
  const [nearbyCrags, setNearbyCrags] = useState<NearbyCragResult[]>([])
  const [nearbyLoading, setNearbyLoading] = useState(false)

  const abortRef = useRef<AbortController | null>(null)
  const searchCacheRef = useRef(new Map<string, { ts: number; data: CragSearchResult[] }>())
  const atlasSync = useAtlasAutoSync(latitude, longitude)

  const fetchNearbyCrags = useCallback(async () => {
    if (latitude === null || latitude === undefined || longitude === null || longitude === undefined) {
      return
    }

    setNearbyLoading(true)
    try {
      const params = new URLSearchParams({ lat: latitude.toString(), lng: longitude.toString() })
      const response = await fetch(`/api/crags/nearby?${params}`)
      if (response.ok) {
        const data = await response.json()
        setNearbyCrags(data)
      }
    } catch {
      reportError(new Error('Failed to fetch nearby crags'), { message: 'Failed to fetch nearby crags' })
    } finally {
      setNearbyLoading(false)
    }
  }, [latitude, longitude])

  useEffect(() => {
    fetchNearbyCrags()
  }, [fetchNearbyCrags])

  const searchCrags = useCallback(async (searchQuery: string) => {
    const normalizedQuery = searchQuery.trim().toLowerCase()
    if (normalizedQuery.length < 2) {
      setResults([])
      return
    }
    const cacheKey = `${normalizedQuery}|${latitude ?? ''}|${longitude ?? ''}`
    const cached = searchCacheRef.current.get(cacheKey)
    const now = Date.now()
    const cacheTtlMs = 2 * 60 * 1000
    if (cached && now - cached.ts < cacheTtlMs) {
      setResults(cached.data)
      return
    }
    setLoading(true)
    setErrorMessage('')
    try {
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller
      const params = new URLSearchParams({ q: normalizedQuery })
      if (latitude !== null && latitude !== undefined && longitude !== null && longitude !== undefined) {
        params.set('lat', latitude.toString())
        params.set('lng', longitude.toString())
      }
      const response = await fetch(`/api/crags/search?${params}`, { signal: controller.signal })
      if (response.ok) {
        const data = await response.json()
        setResults(data)
        searchCacheRef.current.set(cacheKey, { ts: Date.now(), data })
      } else {
        const errorData = await response.json().catch(() => ({}))
        setErrorMessage(errorData.error || 'Failed to search crags')
        setResults([])
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      setErrorMessage('Failed to search crags')
      setResults([])
    } finally {
      setLoading(false)
    }
  }, [latitude, longitude])

  useEffect(() => {
    const timer = setTimeout(() => {
      if (query.length >= 2) {
        searchCrags(query)
      }
    }, 600)
    return () => clearTimeout(timer)
  }, [query, searchCrags])

  useEffect(() => {
    return () => {
      abortRef.current?.abort()
    }
  }, [])

  useEffect(() => {
    const value = newCragRegionTag.trim()
    if (value.length < 2 || !showCreate) {
      setRegionTagResults([])
      return
    }
    let cancelled = false
    const timer = setTimeout(async () => {
      setRegionTagLoading(true)
      try {
        const params = new URLSearchParams({ q: value, kind: 'region' })
        const response = await fetch(`/api/location-tags/search?${params}`)
        if (!response.ok) {
          setRegionTagResults([])
          return
        }
        const data = await response.json()
        if (!cancelled) {
          setRegionTagResults(Array.isArray(data) ? data : [])
        }
      } catch {
        if (!cancelled) setRegionTagResults([])
      } finally {
        if (!cancelled) setRegionTagLoading(false)
      }
    }, 300)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [newCragRegionTag, showCreate])

  const handleSelect = (crag: SubmissionCrag) => {
    setQuery(crag.name)
    setResults([])
    setShowNearby(false)
    setSuccessMessage('')
    setErrorMessage('')
    onSelect(crag)
  }

  const handleCreate = async () => {
    if (!newCragName.trim()) return
    setIsCreating(true)
    setErrorMessage('')
    setSuccessMessage('')
    try {
      const response = await csrfFetch('/api/crags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newCragName.trim(),
          region_tag: newCragRegionTag.trim(),
          sub_area: newCragSubArea.trim() || null,
          rock_type: newCragRockType.trim() || null,
          latitude: latitude ?? null,
          longitude: longitude ?? null,
          selected_country_code: atlasSync.atlas?.countryCode ?? null,
        }),
      })
      if (response.ok) {
        const newCrag = await response.json()
        setSuccessMessage(`Crag "${newCrag.name}" created. You can now upload up to 20 photos in the background.`)
        setShowCreate(false)
        setNewCragName('')
        setNewCragRegionTag('')
        setNewCragSubArea('')
        setNewCragRockType('')
        setRegionTagResults([])
        setQuery(newCrag.name)
        onSelect(newCrag)
        onCreateNew?.(newCrag)
        setResults([newCrag])
        setTimeout(() => setSuccessMessage(''), 3000)
      } else {
        const errorData = await response.json().catch(() => ({ error: 'Failed to create crag' }))
        if (errorData.code === 'DUPLICATE' && errorData.existingCragId) {
          setErrorMessage(errorData.error)
          setTimeout(() => {
            setShowCreate(false)
            setNewCragName('')
            setNewCragRegionTag('')
            setNewCragSubArea('')
            setNewCragRockType('')
            setRegionTagResults([])
            setQuery(errorData.existingCragName)
            searchCrags(errorData.existingCragName)
          }, 2000)
        } else if (errorData.code === 'DUPLICATE_NAME' && errorData.existingCragId) {
          setErrorMessage(errorData.error)
          setTimeout(() => {
            setShowCreate(false)
            setNewCragName('')
            setNewCragRegionTag('')
            setNewCragSubArea('')
            setNewCragRockType('')
            setRegionTagResults([])
            setQuery(errorData.existingCragName)
            searchCrags(errorData.existingCragName)
          }, 2000)
        } else {
          setErrorMessage(errorData.error || 'Failed to create crag')
        }
      }
    } finally {
      setIsCreating(false)
    }
  }

  const hasQuery = query.trim().length >= 2
  const canCreate = newCragName.trim().length > 0

  return (
    <div className="space-y-4">
      <AtlasContextCard result={atlasSync} />
      <div className="space-y-2">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search crags"
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
        />
        {loading ? <p className="text-sm text-gray-500">Searching...</p> : null}
        {errorMessage ? <p className="text-sm text-red-600">{errorMessage}</p> : null}
      </div>

      {!showCreate && latitude != null && longitude != null ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-slate-900">Nearby crags</p>
              <p className="text-xs text-slate-500">Use one nearby or create a new crag at this location.</p>
            </div>
            <button
              type="button"
              onClick={() => setShowNearby((current) => !current)}
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
                    onClick={() => handleSelect(crag)}
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
      ) : null}

      {!showCreate ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium text-slate-900">Search results</p>
            <button
              type="button"
              onClick={() => {
                setShowCreate(true)
                setNewCragName(query.trim())
                setErrorMessage('')
                setSuccessMessage('')
              }}
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
                    onClick={() => handleSelect(crag)}
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
      ) : null}

      {showCreate ? (
        <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-slate-900">Create new crag</p>
              <p className="text-xs text-slate-500">Create a crag at the current draft location.</p>
            </div>
            <button
              type="button"
              onClick={() => {
                setShowCreate(false)
                setErrorMessage('')
              }}
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
                  onClick={() => {
                    setNewCragRegionTag(tag.name)
                    setRegionTagResults([])
                  }}
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
            onClick={() => void handleCreate()}
            disabled={!canCreate || isCreating}
            className="inline-flex rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isCreating ? 'Creating...' : 'Create crag'}
          </button>
        </div>
      ) : null}
    </div>
  )
}
