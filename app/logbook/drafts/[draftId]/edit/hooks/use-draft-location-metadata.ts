'use client'

import { useCallback, useState } from 'react'

export function useDraftLocationMetadata() {
  const [showCragSelector, setShowCragSelector] = useState(false)
  const [latitude, setLatitude] = useState('')
  const [longitude, setLongitude] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchingLocation, setSearchingLocation] = useState(false)
  const [mapOpen, setMapOpen] = useState(false)

  const updateDraftLocation = useCallback((nextLatitude: number, nextLongitude: number) => {
    setLatitude(String(nextLatitude))
    setLongitude(String(nextLongitude))
  }, [])

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
