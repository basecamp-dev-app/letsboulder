'use client'

import { useCallback, useMemo, useState } from 'react'
import { sortFaceDirections } from '@/lib/editor-helpers'
import type { FaceDirection } from '@/lib/submission-types'

function parseCoordinate(value: string): number | null {
  if (value.trim() === '') return null
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return Number.NaN
  return parsed
}

export function useSubmissionLocationMetadata(input: {
  currentUserId: string | null
  ownerUserId: string | null
  cragId: string | null
  initialLatitude: string
  initialLongitude: string
  initialCragName: string
  initialRegionTag: string
  initialSubArea: string
  initialFaceDirections: FaceDirection[]
  initialLocationMode: 'shared' | 'custom'
}) {
  const [latitude, setLatitude] = useState('')
  const [longitude, setLongitude] = useState('')
  const [cragName, setCragName] = useState('')
  const [regionTag, setRegionTag] = useState('')
  const [subArea, setSubArea] = useState('')
  const [faceDirections, setFaceDirections] = useState<FaceDirection[]>([])
  const [locationMode, setLocationMode] = useState<'shared' | 'custom'>('custom')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchingLocation, setSearchingLocation] = useState(false)
  const [locationSearchError, setLocationSearchError] = useState<string | null>(null)
  const [initialLatitude, setInitialLatitude] = useState(input.initialLatitude)
  const [initialLongitude, setInitialLongitude] = useState(input.initialLongitude)
  const [initialCragName, setInitialCragName] = useState(input.initialCragName)
  const [initialRegionTag, setInitialRegionTag] = useState(input.initialRegionTag)
  const [initialSubArea, setInitialSubArea] = useState(input.initialSubArea)
  const [initialFaceDirections, setInitialFaceDirections] = useState<FaceDirection[]>(input.initialFaceDirections)
  const [initialLocationMode, setInitialLocationMode] = useState<'shared' | 'custom'>(input.initialLocationMode)

  const canEditCragMetadata = !!input.currentUserId && !!input.ownerUserId && input.currentUserId === input.ownerUserId && !!input.cragId
  const imageMetadataDirty = useMemo(() => {
    const initialLat = parseCoordinate(initialLatitude)
    const initialLng = parseCoordinate(initialLongitude)
    const currentLat = parseCoordinate(latitude)
    const currentLng = parseCoordinate(longitude)
    return initialLat !== currentLat || initialLng !== currentLng || sortFaceDirections(initialFaceDirections).join('|') !== sortFaceDirections(faceDirections).join('|') || initialLocationMode !== locationMode
  }, [faceDirections, initialFaceDirections, initialLatitude, initialLocationMode, initialLongitude, latitude, locationMode, longitude])
  const cragMetadataDirty = useMemo(() => canEditCragMetadata && (cragName.trim() !== initialCragName.trim() || regionTag.trim() !== initialRegionTag.trim() || subArea.trim() !== initialSubArea.trim()), [canEditCragMetadata, cragName, initialCragName, initialRegionTag, initialSubArea, regionTag, subArea])

  const toggleFaceDirection = useCallback((direction: FaceDirection) => {
    setFaceDirections((prev) => (prev.includes(direction) ? prev.filter((value) => value !== direction) : [...prev, direction]))
  }, [])

  const updateLocation = useCallback((nextLatitude: number, nextLongitude: number) => {
    setLatitude(nextLatitude.toFixed(6))
    setLongitude(nextLongitude.toFixed(6))
    setLocationSearchError(null)
  }, [])

  const handleSearchLocation = useCallback(async () => {
    if (!searchQuery.trim()) return
    setSearchingLocation(true)
    setLocationSearchError(null)
    try {
      const response = await fetch(`/api/locations/search?q=${encodeURIComponent(searchQuery)}`)
      if (!response.ok) { setLocationSearchError('Search failed'); return }
      const data = await response.json() as Array<{ lat?: number; lon?: number }> | null
      const first = Array.isArray(data) ? data[0] : null
      if (!first || typeof first.lat !== 'number' || typeof first.lon !== 'number') { setLocationSearchError('Location not found'); return }
      updateLocation(first.lat, first.lon)
    } catch {
      setLocationSearchError('Failed to search location')
    } finally {
      setSearchingLocation(false)
    }
  }, [searchQuery, updateLocation])

  return {
    latitude,
    setLatitude,
    longitude,
    setLongitude,
    cragName,
    setCragName,
    regionTag,
    setRegionTag,
    subArea,
    setSubArea,
    faceDirections,
    setFaceDirections,
    locationMode,
    setLocationMode,
    searchQuery,
    setSearchQuery,
    searchingLocation,
    setSearchingLocation,
    locationSearchError,
    setLocationSearchError,
    initialLatitude,
    setInitialLatitude,
    initialLongitude,
    setInitialLongitude,
    initialCragName,
    setInitialCragName,
    initialRegionTag,
    setInitialRegionTag,
    initialSubArea,
    setInitialSubArea,
    initialFaceDirections,
    setInitialFaceDirections,
    initialLocationMode,
    setInitialLocationMode,
    canEditCragMetadata,
    imageMetadataDirty,
    cragMetadataDirty,
    toggleFaceDirection,
    handleSearchLocation,
  }
}
