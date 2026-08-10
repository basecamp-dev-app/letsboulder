'use client'

import { useCallback, useRef, useState } from 'react'

interface LocationSearchResult {
  lat?: number
  lon?: number
}

export function useLocationSearch(onResolved: (latitude: number, longitude: number) => void) {
  const [searchQuery, setSearchQuery] = useState('')
  const [searchingLocation, setSearchingLocation] = useState(false)
  const [locationSearchError, setLocationSearchError] = useState<string | null>(null)
  const searchAbortRef = useRef<AbortController | null>(null)

  const handleSearchLocation = useCallback(async () => {
    const trimmedQuery = searchQuery.trim()
    if (trimmedQuery.length < 2) return

    searchAbortRef.current?.abort()
    const controller = new AbortController()
    searchAbortRef.current = controller
    setSearchingLocation(true)
    setLocationSearchError(null)

    try {
      const response = await fetch(`/api/locations/search?q=${encodeURIComponent(trimmedQuery)}`, {
        signal: controller.signal,
      })
      if (!response.ok) {
        setLocationSearchError('Search failed')
        return
      }

      const data = await response.json() as LocationSearchResult[] | null
      const first = Array.isArray(data) ? data[0] : null
      if (!first || typeof first.lat !== 'number' || typeof first.lon !== 'number') {
        setLocationSearchError('Location not found')
        return
      }

      onResolved(first.lat, first.lon)
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      setLocationSearchError('Failed to search location')
    } finally {
      if (searchAbortRef.current === controller) {
        searchAbortRef.current = null
        setSearchingLocation(false)
      }
    }
  }, [onResolved, searchQuery])

  return {
    searchQuery,
    setSearchQuery,
    searchingLocation,
    setSearchingLocation,
    locationSearchError,
    setLocationSearchError,
    handleSearchLocation,
  }
}
