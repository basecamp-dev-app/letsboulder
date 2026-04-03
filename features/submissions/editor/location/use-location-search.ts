'use client'

import { useCallback, useState } from 'react'

interface LocationSearchResult {
  lat?: number
  lon?: number
}

export function useLocationSearch(onResolved: (latitude: number, longitude: number) => void) {
  const [searchQuery, setSearchQuery] = useState('')
  const [searchingLocation, setSearchingLocation] = useState(false)
  const [locationSearchError, setLocationSearchError] = useState<string | null>(null)

  const handleSearchLocation = useCallback(async () => {
    if (!searchQuery.trim()) return

    setSearchingLocation(true)
    setLocationSearchError(null)

    try {
      const response = await fetch(`/api/locations/search?q=${encodeURIComponent(searchQuery)}`)
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
    } catch {
      setLocationSearchError('Failed to search location')
    } finally {
      setSearchingLocation(false)
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
