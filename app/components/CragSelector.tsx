'use client'

import { useState, useEffect, useCallback } from 'react'
import ReportCragModal from './ReportCragModal'
import { csrfFetch } from '@/hooks/useCsrf'

interface Crag {
  id: string
  name: string
  tide_level?: number | null
  latitude?: number
  longitude?: number
  region_name?: string | null
  report_count?: number
  is_flagged?: boolean
}

interface CragSelectorProps {
  latitude: number
  longitude: number
  onSelect: (crag: Crag) => void
  onCreateNew?: (name: string, region?: string) => void
  selectedCragId?: string | null
}

export default function CragSelector({
  latitude,
  longitude,
  onSelect,
  onCreateNew,
  selectedCragId,
}: CragSelectorProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Crag[]>([])
  const [loading, setLoading] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [newCragName, setNewCragName] = useState('')
  const [newCragRegion, setNewCragRegion] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const [successMessage, setSuccessMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [showReportModal, setShowReportModal] = useState(false)
  const [reportCrag, setReportCrag] = useState<Crag | null>(null)

  const searchCrags = useCallback(async (searchQuery: string) => {
    if (searchQuery.length < 2) {
      setResults([])
      return
    }

    setLoading(true)
    setErrorMessage('')
    try {
      const response = await fetch(`/api/crags/search?q=${encodeURIComponent(searchQuery)}`)
      if (response.ok) {
        const data = await response.json()
        setResults(data)
      } else {
        setResults([])
      }
    } catch (error) {
      console.error('Error searching crags:', error)
      setResults([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => {
      if (query.length >= 2) {
        searchCrags(query)
      }
    }, 300)

    return () => clearTimeout(timer)
  }, [query, searchCrags])

  const handleSelect = (crag: Crag) => {
    setQuery(crag.name)
    setResults([])
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
          latitude,
          longitude,
          region_name: newCragRegion.trim() || null,
        }),
      })

      if (response.ok) {
        const newCrag = await response.json()
        setSuccessMessage(`Crag "${newCrag.name}" created successfully!`)
        setShowCreate(false)
        setNewCragName('')
        setNewCragRegion('')
        setQuery(newCrag.name)
        onSelect(newCrag)
        onCreateNew?.(newCrag.name, newCrag.region_name || undefined)
        setResults([newCrag])
        setTimeout(() => setSuccessMessage(''), 3000)
      } else {
        const errorData = await response.json().catch(() => ({ error: 'Failed to create crag' }))
        
        if (errorData.code === 'DUPLICATE' && errorData.existingCragId) {
          setErrorMessage(errorData.error)
          setTimeout(() => {
            setShowCreate(false)
            setNewCragName('')
            setNewCragRegion('')
            setQuery(errorData.existingCragName)
            searchCrags(errorData.existingCragName)
          }, 2000)
        } else if (errorData.code === 'DUPLICATE_NAME' && errorData.existingCragId) {
          setErrorMessage(errorData.error)
          setTimeout(() => {
            setShowCreate(false)
            setNewCragName('')
            setNewCragRegion('')
            setQuery(errorData.existingCragName)
            searchCrags(errorData.existingCragName)
          }, 2000)
        } else {
          const errorDetail = errorData.details || ''
          setErrorMessage(errorData.error + (errorDetail ? `: ${errorDetail}` : ''))
        }
      }
    } catch (error) {
      console.error('Error creating crag:', error)
      setErrorMessage('Failed to create crag. Please try again.')
    } finally {
      setIsCreating(false)
    }
  }

  const handleCancelCreate = () => {
    setShowCreate(false)
    setNewCragName('')
    setNewCragRegion('')
    setErrorMessage('')
  }

  const handleShowCreate = () => {
    setShowCreate(true)
    setErrorMessage('')
    setSuccessMessage('')
  }

  const handleReport = (crag: Crag) => {
    setReportCrag(crag)
    setShowReportModal(true)
  }

  const formatCragName = (crag: Crag) => {
    if (crag.region_name) {
      return `${crag.name} (${crag.region_name})`
    }
    return crag.name
  }

  return (
    <div className="crag-selector">
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
        Crag
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

      {showReportModal && reportCrag && (
        <ReportCragModal
          cragId={reportCrag.id}
          cragName={formatCragName(reportCrag)}
          onClose={() => {
            setShowReportModal(false)
            setReportCrag(null)
          }}
          onSubmitted={() => {
            if (query.length >= 2) {
              searchCrags(query)
            }
          }}
        />
      )}

      {showCreate ? (
        <div className="space-y-3">
          <input
            type="text"
            value={newCragName}
            onChange={(e) => setNewCragName(e.target.value)}
            placeholder="Enter crag name"
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreate()
              if (e.key === 'Escape') handleCancelCreate()
            }}
          />
          <input
            type="text"
            value={newCragRegion}
            onChange={(e) => setNewCragRegion(e.target.value)}
            placeholder="Region (optional, auto-detected from GPS)"
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreate()
              if (e.key === 'Escape') handleCancelCreate()
            }}
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
              placeholder="Search for a crag..."
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              onFocus={() => {
                if (query.length >= 2) searchCrags(query)
              }}
            />

            {loading && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                <div className="animate-spin h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full" />
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
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-gray-900 dark:text-gray-100 flex items-center gap-2">
                          {formatCragName(crag)}
                          {crag.is_flagged && (
                            <span className="text-xs px-2 py-0.5 bg-red-100 text-red-700 rounded">
                              🚩 {crag.report_count} reports
                            </span>
                          )}
                        </div>
                        {crag.tide_level && (
                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            Tide level: {crag.tide_level}
                          </div>
                        )}
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleReport(crag)
                        }}
                        className="text-gray-400 hover:text-red-500 p-1"
                        title="Report this crag"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9" />
                        </svg>
                      </button>
                    </div>
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
