'use client'

import { useCallback, useMemo, useState } from 'react'
import {
  formatCoordinate,
  isCragMetadataDirty,
  isImageMetadataDirty,
} from '@/features/editor/location/location-metadata'
import { useLocationSearch } from '@/features/editor/location/use-location-search'
import type { FaceDirection } from '@/lib/submission-types'

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
  const [initialLatitude, setInitialLatitude] = useState(input.initialLatitude)
  const [initialLongitude, setInitialLongitude] = useState(input.initialLongitude)
  const [initialCragName, setInitialCragName] = useState(input.initialCragName)
  const [initialRegionTag, setInitialRegionTag] = useState(input.initialRegionTag)
  const [initialSubArea, setInitialSubArea] = useState(input.initialSubArea)
  const [initialFaceDirections, setInitialFaceDirections] = useState<FaceDirection[]>(input.initialFaceDirections)
  const [initialLocationMode, setInitialLocationMode] = useState<'shared' | 'custom'>(input.initialLocationMode)

  const canEditCragMetadata = !!input.currentUserId && !!input.ownerUserId && input.currentUserId === input.ownerUserId && !!input.cragId
  const imageMetadataDirty = useMemo(() => isImageMetadataDirty({
    initialLatitude,
    initialLongitude,
    latitude,
    longitude,
    initialFaceDirections,
    faceDirections,
    initialLocationMode,
    locationMode,
  }), [faceDirections, initialFaceDirections, initialLatitude, initialLocationMode, initialLongitude, latitude, locationMode, longitude])
  const cragMetadataDirty = useMemo(() => isCragMetadataDirty({
    canEditCragMetadata,
    cragName,
    initialCragName,
    regionTag,
    initialRegionTag,
    subArea,
    initialSubArea,
  }), [canEditCragMetadata, cragName, initialCragName, initialRegionTag, initialSubArea, regionTag, subArea])

  const toggleFaceDirection = useCallback((direction: FaceDirection) => {
    setFaceDirections((prev) => (prev.includes(direction) ? prev.filter((value) => value !== direction) : [...prev, direction]))
  }, [])

  const updateLocation = useCallback((nextLatitude: number, nextLongitude: number) => {
    setLatitude(formatCoordinate(nextLatitude))
    setLongitude(formatCoordinate(nextLongitude))
  }, [])

  const {
    searchQuery,
    setSearchQuery,
    searchingLocation,
    setSearchingLocation,
    locationSearchError,
    setLocationSearchError,
    handleSearchLocation,
  } = useLocationSearch(updateLocation)

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
