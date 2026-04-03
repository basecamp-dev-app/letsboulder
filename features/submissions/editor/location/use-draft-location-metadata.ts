'use client'

import { useCallback, useState } from 'react'
import { formatCoordinate } from '@/features/editor/location/location-metadata'
import { useLocationSearch } from './use-location-search'

export function useDraftLocationMetadata() {
  const [showCragSelector, setShowCragSelector] = useState(false)
  const [latitude, setLatitude] = useState('')
  const [longitude, setLongitude] = useState('')
  const [mapOpen, setMapOpen] = useState(false)

  const updateDraftLocation = useCallback((nextLatitude: number, nextLongitude: number) => {
    setLatitude(formatCoordinate(nextLatitude))
    setLongitude(formatCoordinate(nextLongitude))
  }, [])

  const {
    searchQuery,
    setSearchQuery,
    searchingLocation,
    setSearchingLocation,
  } = useLocationSearch(updateDraftLocation)

  return {
    showCragSelector,
    setShowCragSelector,
    latitude,
    setLatitude,
    longitude,
    setLongitude,
    searchQuery,
    setSearchQuery,
    searchingLocation,
    setSearchingLocation,
    mapOpen,
    setMapOpen,
    updateDraftLocation,
  }
}
