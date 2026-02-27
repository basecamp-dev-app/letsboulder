
'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import type { Crag } from '@/lib/submission-types'
import { csrfFetch } from '@/hooks/useCsrf'

interface CragSelectorProps {
  latitude?: number | null
  longitude?: number | null
  onSelect: (crag: Crag) => void
  onCreateNew?: (name: string) => void
  selectedCragId?: string | null
}

interface CragSearchResult extends Crag {
  distance?: number | null
}

interface NearbyCragResult extends Crag {
  distance?: number | null
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
  const [newCragRockType, setNewCragRockType] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const [successMessage, setSuccessMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [showNearby, setShowNearby] = useState(false)
  const [nearbyCrags, setNearbyCrags] = useState<NearbyCragResult[]>([])
  const [nearbyLoading, setNearbyLoading] = useState(false)

  const abortRef = useRef<AbortController | null>(null)
  const searchCacheRef = useRef(new Map<string, { ts: number; data: CragSearchResult[] }>())

  const fetchNearbyCrags = useCallback(async () => {
    if (latitude === null || latitude === undefined || longitude === null || longitude === undefined) {
      return
    }

    setNearbyLoading(true)
    try {
      const params = new URLSearchParams({
        lat: latitude.toString(),
        lng: longitude.toString()
      })
      const response = await fetch(`/api/crags/nearby?${params}`)
      if (response.ok) {
        const data = await response.json()
        setNearbyCrags(data)
      }
    } catch {
      console.error('Failed to fetch nearby crags')
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

      const response = await fetch(`/api/crags/search?${params}`, {
        signal: controller.signal,
      })
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
      if (error instanceof DOMException && error.name === 'AbortError') {
        return
      }
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

  const handleSelect = (crag: Crag) => {
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
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: newCragName.trim(),
          rock_type: newCragRockType.trim() || null,
          latitude: latitude ?? null,
          longitude: longitude ?? null,
        }),
      })

      if (response.ok) {
        const newCrag = await response.json()
        setSuccessMessage(`Crag "${newCrag.name}" created successfully!`)
        setShowCreate(false)
        setNewCragName('')
        setNewCragRockType('')
        setQuery(newCrag.name)
        onSelect(newCrag)
        onCreateNew?.(newCrag.name)
        setResults([newCrag])
        setTimeout(() => setSuccessMessage(''), 3000)
      } else {
        const errorData = await response.json().catch(() => ({ error: 'Failed to create crag' }))

        if (errorData.code === 'DUPLICATE' && errorData.existingCragId) {
          setErrorMessage(errorData.error)
          setTimeout(() => {
            setShowCreate(false)
            setNewCragName('')
            setNewCragRockType('')
            setQuery(errorData.existingCragName)
            searchCrags(errorData.existingCragName)
          }, 2000)
        } else if (errorData.code === 'DUPLICATE_NAME' && errorData.existingCragId) {
          setErrorMessage(errorData.error)
          setTimeout(() => {
            setShowCreate(false)
            setNewCragName('')
            setNewCragRockType('')
            setQuery(errorData.existingCragName)
            searchCrags(errorData.existingCragName)
          }, 2000)
        } else {
          const errorDetail = errorData.details || ''
          setErrorMessage(errorData.error + (errorDetail ? `: ${errorDetail}` : ''))
        }
      }
      } catch (error) {
      const message = error instanceof Error && error.message
        ? error.message
        : 'Failed to create crag. Please try again.'
      setErrorMessage(message)
    } finally {
      setIsCreating(false)
    }
  }

  const handleCancelCreate = () => {
    setShowCreate(false)
    setNewCragName('')
    setNewCragRockType('')
    setErrorMessage('')
  }

  const handleShowCreate = () => {
    setShowCreate(true)
    setErrorMessage('')
    setSuccessMessage('')
  }

  const formatCoordinates = (lat?: number | null, lng?: number | null) => {
    if (!lat || !lng) return null
    const latDir = lat >= 0 ? 'N' : 'S'
    const lngDir = lng >= 0 ? 'E' : 'W'
    return `${Math.abs(lat).toFixed(4)}°${latDir}, ${Math.abs(lng).toFixed(4)}°${lngDir}`
  }

  return (
    <div className="crag-selector">
      {successMessage && (
        <div className="mb-2 p-2 bg-green-50 border border-green-200 rounded text-sm text-green-700">
          {successMessage}
        </div>
      )}

      {errorMessage && (
        <div className="mb-2 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">
          {errorMessage}
        </div>
      )}

      {showCreate ? (
        <div className="space-y-3">
          <input
            type="text"
            value={newCragName}
            onChange={(e) => setNewCragName(e.target.value)}
            placeholder="Enter crag name"
            className="w-full px-3 py-3 min-h-[48px] text-lg pr-24 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            autoFocus
          />

          <input
            type="text"
            value={newCragRockType}
            onChange={(e) => setNewCragRockType(e.target.value)}
            placeholder="Rock type (optional, e.g., limestone, granite)"
            className="w-full px-3 py-3 min-h-[48px] text-lg pr-24 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <div className="flex gap-2">
            <button
              onClick={handleCreate}
              disabled={!newCragName.trim() || isCreating}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isCreating && (
                <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
              )}
              {isCreating ? 'Creating...' : 'Create Crag'}
            </button>
            <button
              onClick={handleCancelCreate}
              disabled={isCreating}
              className="px-4 py-2 bg-gray-300 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-400 dark:hover:bg-gray-600"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="relative">
            <input
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setResults([])
                setShowNearby(false)
                setSuccessMessage('')
                setErrorMessage('')
              }}
              placeholder="Search for a crag..."
              className="w-full px-3 py-3 min-h-[48px] text-lg pr-24 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              onFocus={() => {
                setShowNearby(true)
                if (query.length >= 2) searchCrags(query)
              }}
            />

            {loading && (
              <div className="absolute right-24 top-1/2 -translate-y-1/2">
                <div className="animate-spin h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full" />
              </div>
            )}

            <button
              onClick={handleShowCreate}
              className="absolute right-1 top-1/2 -translate-y-1/2 px-2 py-1 text-xs text-blue-600 hover:text-blue-800 dark:text-blue-400"
            >
              + Create
            </button>

            {showNearby && nearbyCrags.length > 0 && (
              <ul className="absolute z-10 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md shadow-lg max-h-60 overflow-auto">
                {nearbyCrags.map((crag) => (
                  <li
                    key={crag.id}
                    onClick={() => handleSelect(crag)}
                    className={`px-3 py-2 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 ${
                      selectedCragId === crag.id ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                    }`}
                  >
                    <div className="font-medium text-gray-900 dark:text-gray-100">
                      {crag.name}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      </svg>
                      {crag.distance !== null && crag.distance !== undefined ? (
                        <span className="text-blue-600 dark:text-blue-400">
                          ~{crag.distance}km from your image
                        </span>
                      ) : (
                        formatCoordinates(crag.latitude, crag.longitude)
                      )}
                    </div>
                    {crag.rock_type && (
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {crag.rock_type}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {showNearby && nearbyLoading && (
              <div className="absolute z-10 w-full mt-1 p-3 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md shadow-lg text-sm text-gray-500 dark:text-gray-400 text-center">
                Loading nearby crags...
              </div>
            )}

            {results.length > 0 && (
              <ul className="absolute z-10 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md shadow-lg max-h-60 overflow-auto">
                {results.map((crag) => (
                  <li
                    key={crag.id}
                    onClick={() => handleSelect(crag)}
                    className={`px-3 py-2 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 ${
                      selectedCragId === crag.id ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                    }`}
                  >
                    <div className="font-medium text-gray-900 dark:text-gray-100">
                      {crag.name}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      </svg>
                      {formatCoordinates(crag.latitude, crag.longitude)}
                      {crag.distance !== null && crag.distance !== undefined && (
                        <span className="text-blue-600 dark:text-blue-400">
                          • ~{crag.distance}km from your image
                        </span>
                      )}
                    </div>
                    {crag.rock_type && (
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {crag.rock_type}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {query.length >= 2 && !loading && results.length === 0 && !successMessage && (
              <div className="absolute z-10 w-full mt-1 p-3 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md shadow-lg text-sm text-gray-500 dark:text-gray-400 text-center">
                No crags found matching &quot;{query}&quot;
              </div>
            )}
          </div>

          <button
            onClick={handleShowCreate}
            className="mt-2 text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400"
          >
            + Create new crag
          </button>
        </>
      )}
    </div>
  )
}
