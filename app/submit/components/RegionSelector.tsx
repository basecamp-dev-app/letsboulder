'use client'

import { useState, useEffect, useCallback } from 'react'
import type { Region } from '@/lib/submission-types'

interface RegionSelectorProps {
  onSelect: (region: Region) => void
  initialLat?: number | null
  initialLng?: number | null
  preselectedRegion?: Region | null
  loadingRegion?: boolean
}

export default function RegionSelector({
  onSelect,
  initialLat = null,
  initialLng = null,
  preselectedRegion,
  loadingRegion = false
}: RegionSelectorProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Region[]>([])
  const [loading, setLoading] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [newRegionName, setNewRegionName] = useState('')
  const [newRegionCountry, setNewRegionCountry] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    if (preselectedRegion && query === '') {
      setQuery(preselectedRegion.name)
      setResults([preselectedRegion])
    }
  }, [preselectedRegion])

  const searchRegions = useCallback(async (searchQuery: string) => {
    if (searchQuery.length < 2) {
      setResults([])
      return
    }

    setLoading(true)
    setErrorMessage('')

    try {
      const params = new URLSearchParams({ q: searchQuery })
      const response = await fetch(`/api/regions/search?${params}`)
      
      if (response.ok) {
        const data = await response.json()
        setResults(data)
      } else {
        setResults([])
      }
    } catch (error) {
      console.error('Error searching regions:', error)
      setResults([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => {
      if (query.length >= 2) {
        searchRegions(query)
      }
    }, 300)

    return () => clearTimeout(timer)
  }, [query, searchRegions])

  const handleSelect = (region: Region) => {
    onSelect(region)
  }

  const handleCreate = async () => {
    if (!newRegionName.trim()) return

    setIsCreating(true)
    setErrorMessage('')

    try {
      const response = await fetch('/api/regions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: newRegionName.trim(),
          country_code: newRegionCountry.trim().toUpperCase().slice(0, 2) || null
        }),
      })

      if (response.ok) {
        const newRegion = await response.json()
        handleSelect(newRegion)
      } else {
        const errorData = await response.json().catch(() => ({ error: 'Failed to create region' }))
        setErrorMessage(errorData.error || 'Failed to create region')
      }
    } catch {
      setErrorMessage('Failed to create region')
    } finally {
      setIsCreating(false)
    }
  }

  const handleShowCreate = () => {
    setShowCreate(true)
    setQuery('')
    setResults([])
    setErrorMessage('')
  }

  const handleCancelCreate = () => {
    setShowCreate(false)
    setNewRegionName('')
    setNewRegionCountry('')
    setErrorMessage('')
    setQuery('')
    setResults([])
  }

  if (preselectedRegion && !showCreate) {
    return (
      <div className="space-y-4">
        {loadingRegion && (
          <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
            <div className="flex items-center gap-2">
              <div className="animate-spin h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full" />
              <p className="text-sm text-blue-700 dark:text-blue-300">
                Finding region from GPS...
              </p>
            </div>
          </div>
        )}

        <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
          <p className="text-sm text-green-700 dark:text-green-300 mb-2">
            Auto-detected region
          </p>
          <button
            onClick={() => handleSelect(preselectedRegion)}
            className="w-full py-3 bg-green-600 text-white text-lg rounded-lg font-semibold hover:bg-green-700 transition-colors shadow-sm"
          >
            {preselectedRegion.name}
          </button>
          <button
            onClick={() => {
              setQuery('')
              setResults([])
            }}
            className="w-full mt-2 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 border border-gray-300 dark:border-gray-600 rounded-lg"
          >
            Change region...
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {showCreate ? (
        <div className="space-y-3">
          <input
            type="text"
            value={newRegionName}
            onChange={(e) => setNewRegionName(e.target.value)}
            placeholder="Enter region name"
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreate()
              if (e.key === 'Escape') handleCancelCreate()
            }}
          />
          <input
            type="text"
            value={newRegionCountry}
            onChange={(e) => setNewRegionCountry(e.target.value.toUpperCase())}
            placeholder="Country code (optional, e.g., GB, FR, US)"
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            maxLength={2}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreate()
              if (e.key === 'Escape') handleCancelCreate()
            }}
          />
          <div className="flex gap-2">
            <button
              onClick={handleCreate}
              disabled={!newRegionName.trim() || isCreating}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isCreating && (
                <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
              )}
              {isCreating ? 'Creating...' : 'Create Region'}
            </button>
            <button
              onClick={handleCancelCreate}
              disabled={isCreating}
              className="px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400"
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
              }}
              placeholder="Search for a region..."
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />

            {loading && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                <div className="animate-spin h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full" />
              </div>
            )}

            {results.length > 0 && (
              <ul className="absolute z-10 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md shadow-lg max-h-60 overflow-auto">
                {results.map((region) => (
                  <li
                    key={region.id}
                    onClick={() => handleSelect(region)}
                    className="px-3 py-2 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700"
                  >
                    <div className="font-medium text-gray-900 dark:text-gray-100">
                      {region.name}
                    </div>
                    {region.country_code && (
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {region.country_code}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {query.length >= 2 && !loading && results.length === 0 && (
              <div className="absolute z-10 w-full mt-1 p-3 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md shadow-lg text-sm text-gray-500 dark:text-gray-400 text-center">
                No regions found matching &ldquo;{query}&rdquo;
              </div>
            )}

            {results.length > 0 && (
              <ul className="absolute z-10 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md shadow-lg max-h-60 overflow-auto">
                {results.map((region) => (
                  <li
                    key={region.id}
                    onClick={() => handleSelect(region)}
                    className="px-3 py-2 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700"
                  >
                    <div className="font-medium text-gray-900 dark:text-gray-100">
                      {region.name}
                    </div>
                    {region.country_code && (
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {region.country_code}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {query.length >= 2 && !loading && results.length === 0 && (
              <div className="pt-2">
                <button
                  onClick={handleShowCreate}
                  className="text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400"
                >
                  Don&apos;t see your region? Create new
                </button>
              </div>
            )}

            {results.length > 0 && (
              <div className="pt-2">
                <button
                  onClick={handleShowCreate}
                  className="text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400"
                >
                  Don&apos;t see your region? Create new
                </button>
              </div>
            )}
          </div>

          {errorMessage && (
            <div className="p-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">
              {errorMessage}
            </div>
          )}

          <button
            onClick={handleShowCreate}
            className="text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400"
          >
            + Create new region
          </button>
        </>
      )}
    </div>
  )
}
