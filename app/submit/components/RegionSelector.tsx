'use client'

import { useState, useEffect, useCallback } from 'react'
import type { Region } from '@/lib/submission-types'

interface RegionSelectorProps {
  onSelect: (region: Region) => void
  onCreateNew?: (name: string, countryCode?: string) => void
  selectedRegionId?: string | null
}

export default function RegionSelector({
  onSelect,
  onCreateNew,
  selectedRegionId
}: RegionSelectorProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Region[]>([])
  const [loading, setLoading] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [newRegionName, setNewRegionName] = useState('')
  const [newRegionCountry, setNewRegionCountry] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const [successMessage, setSuccessMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')

  const searchRegions = useCallback(async (searchQuery: string) => {
    if (searchQuery.length < 2) {
      setResults([])
      return
    }

    setLoading(true)
    setErrorMessage('')

    try {
      const response = await fetch(`/api/regions?q=${encodeURIComponent(searchQuery)}`)
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
    setQuery(region.name)
    setResults([])
    setSuccessMessage('')
    setErrorMessage('')
    onSelect(region)
  }

  const handleCreate = async () => {
    if (!newRegionName.trim()) return

    setIsCreating(true)
    setErrorMessage('')
    setSuccessMessage('')

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
        setSuccessMessage(`Region "${newRegion.name}" created successfully!`)
        setShowCreate(false)
        setNewRegionName('')
        setNewRegionCountry('')
        setQuery(newRegion.name)
        onSelect(newRegion)
        onCreateNew?.(newRegion.name, newRegion.country_code || undefined)
        setResults([newRegion])
        setTimeout(() => setSuccessMessage(''), 3000)
      } else {
        const errorData = await response.json().catch(() => ({ error: 'Failed to create region' }))
        
        if (errorData.code === 'DUPLICATE' && errorData.existingId) {
          setErrorMessage(errorData.error)
          setTimeout(() => {
            setShowCreate(false)
            setNewRegionName('')
            setNewRegionCountry('')
            setQuery(errorData.existingName)
            searchRegions(errorData.existingName)
          }, 2000)
        } else {
          setErrorMessage(errorData.error || 'Failed to create region')
        }
      }
    } catch (error) {
      console.error('Error creating region:', error)
      setErrorMessage('Failed to create region. Please try again.')
    } finally {
      setIsCreating(false)
    }
  }

  const handleCancelCreate = () => {
    setShowCreate(false)
    setNewRegionName('')
    setNewRegionCountry('')
    setErrorMessage('')
  }

  const handleShowCreate = () => {
    setShowCreate(true)
    setErrorMessage('')
    setSuccessMessage('')
  }

  return (
    <div className="region-selector">
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
        Region
      </label>

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
                setSuccessMessage('')
                setErrorMessage('')
              }}
              placeholder="Search for a region..."
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              onFocus={() => {
                if (query.length >= 2) searchRegions(query)
              }}
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
                    className={`px-3 py-2 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 ${
                      selectedRegionId === region.id ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-gray-900 dark:text-gray-100">
                          {region.name}
                        </div>
                        {region.country_code && (
                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            {region.country_code}
                          </div>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {query.length >= 2 && !loading && results.length === 0 && !successMessage && (
              <div className="absolute z-10 w-full mt-1 p-3 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md shadow-lg text-sm text-gray-500 dark:text-gray-400 text-center">
                No regions found matching &quot;{query}&quot;
              </div>
            )}
          </div>

          <button
            onClick={handleShowCreate}
            className="mt-2 text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400"
          >
            + Create new region
          </button>
        </>
      )}
    </div>
  )
}
