'use client'

import { useCallback, useEffect, useMemo, type MutableRefObject } from 'react'
import { formatCoordinate } from '@/features/editor/location/location-metadata'
import { csrfFetch } from '@/hooks/useCsrf'
import type { DraftLocationSearchResponse, DraftPayload, DraftRoute, ManageImageTab } from '@/features/submissions/draft-editor/lib/edit-draft-types'
import { isValidLocationCoordinate } from '@/features/submissions/draft-editor/lib/edit-draft-types'

interface UseEditDraftLocationSyncParams {
  draft: DraftPayload | null
  draftId: string
  draftUpdatedAt: string | null
  routeType: string
  isAnonymousSubmission: boolean
  creditPlatform: string
  creditHandle: string
  latitude: string
  longitude: string
  effectiveMarkerPosition: [number, number] | null
  activeDraftImageId: string | null
  activeImageLocationMode: 'shared' | 'custom'
  customGpsByImageId: Record<string, { latitude: number | null; longitude: number | null }>
  locationModeByImageId: Record<string, 'shared' | 'custom'>
  mergedManageImages: ManageImageTab[]
  imagesPayload: Array<{ id: string; display_order: number; route_data: Record<string, unknown> }>
  imagesPayloadSignature: string
  routesByImageId: Record<string, DraftRoute[]>
  selectedCrag: { id: string; name: string; latitude: number | null; longitude: number | null } | null
  cragId: string | null
  nearbyCragId: string | null
  nearbyCragName: string | null
  nearbyCragDominantRouteType: string | null
  hasExplicitRouteType: boolean
  atlasSync: {
    atlas?: {
      countryId?: string | null
      countryCode?: string | null
      countryName?: string | null
      adminRegionName?: string | null
      unRegionName?: string | null
      continentName?: string | null
    } | null
  }
  hasHydratedLocationRef: MutableRefObject<boolean>
  lastLocationSyncRef: MutableRefObject<string | null>
  setLatitude: (value: string) => void
  setLongitude: (value: string) => void
  setDraftUpdatedAt: (value: string | null) => void
  setRouteType: (value: string) => void
  setCragId: (value: string | null) => void
  setSelectedCrag: React.Dispatch<React.SetStateAction<{ id: string; name: string; latitude: number | null; longitude: number | null } | null>>
  setCustomGpsByImageId: React.Dispatch<React.SetStateAction<Record<string, { latitude: number | null; longitude: number | null }>>>
  updateDraftLocation: (latitude: number, longitude: number) => void
  setMapOpen: (value: boolean) => void
  searchQuery: string
  setSearchingLocation: (value: boolean) => void
  setLocationSearchError: (value: string | null) => void
}

export function useEditDraftLocationSync({
  draft,
  draftId,
  draftUpdatedAt,
  routeType,
  isAnonymousSubmission,
  creditPlatform,
  creditHandle,
  latitude,
  longitude,
  effectiveMarkerPosition,
  activeDraftImageId,
  activeImageLocationMode,
  customGpsByImageId,
  locationModeByImageId,
  mergedManageImages,
  imagesPayload,
  imagesPayloadSignature,
  routesByImageId,
  selectedCrag,
  cragId,
  nearbyCragId,
  nearbyCragName,
  nearbyCragDominantRouteType,
  hasExplicitRouteType,
  atlasSync,
  hasHydratedLocationRef,
  lastLocationSyncRef,
  setLatitude,
  setLongitude,
  setDraftUpdatedAt,
  setRouteType,
  setCragId,
  setSelectedCrag,
  setCustomGpsByImageId,
  updateDraftLocation,
  setMapOpen,
  searchQuery,
  setSearchingLocation,
  setLocationSearchError,
}: UseEditDraftLocationSyncParams) {
  const averagedRouteImageLocation = useMemo<[number, number] | null>(() => {
    const qualifyingCoordinates = mergedManageImages
      .filter((image) => {
        const routes = routesByImageId[image.imageId] || []
        if (routes.length === 0) return false
        if ((locationModeByImageId[image.imageId] || image.locationMode || 'shared') === 'custom') return false
        return isValidLocationCoordinate(image.latitude, image.longitude)
      })
      .map((image) => [image.latitude as number, image.longitude as number] as const)

    if (qualifyingCoordinates.length === 0) return null

    const totals = qualifyingCoordinates.reduce((acc, [lat, lng]) => ({
      latitude: acc.latitude + lat,
      longitude: acc.longitude + lng,
    }), { latitude: 0, longitude: 0 })

    return [
      totals.latitude / qualifyingCoordinates.length,
      totals.longitude / qualifyingCoordinates.length,
    ]
  }, [locationModeByImageId, mergedManageImages, routesByImageId])

  const activeImageCustomPosition = useMemo<[number, number] | null>(() => {
    if (!activeDraftImageId || activeImageLocationMode !== 'custom') return null
    const gps = customGpsByImageId[activeDraftImageId]
    if (!gps || !isValidLocationCoordinate(gps.latitude, gps.longitude)) return null
    return [gps.latitude as number, gps.longitude as number]
  }, [activeDraftImageId, activeImageLocationMode, customGpsByImageId])

  const fallbackLocation = useMemo<[number, number] | null>(() => {
    const firstImagePin = mergedManageImages.find((image) => isValidLocationCoordinate(image.latitude, image.longitude)) || null
    if (firstImagePin) {
      return [firstImagePin.latitude as number, firstImagePin.longitude as number]
    }

    if (selectedCrag && isValidLocationCoordinate(selectedCrag.latitude, selectedCrag.longitude)) {
      return [selectedCrag.latitude, selectedCrag.longitude as number]
    }

    return null
  }, [mergedManageImages, selectedCrag])

  useEffect(() => {
    if (!draft) return
    hasHydratedLocationRef.current = true
  }, [draft, hasHydratedLocationRef])

  useEffect(() => {
    if (!hasHydratedLocationRef.current || !averagedRouteImageLocation) return

    const [nextLatitude, nextLongitude] = averagedRouteImageLocation
    const currentLatitude = Number(latitude)
    const currentLongitude = Number(longitude)
    const hasSameLocation = Number.isFinite(currentLatitude)
      && Number.isFinite(currentLongitude)
      && Math.abs(currentLatitude - nextLatitude) < 0.000001
      && Math.abs(currentLongitude - nextLongitude) < 0.000001

    if (hasSameLocation) return

    setLatitude(formatCoordinate(nextLatitude))
    setLongitude(formatCoordinate(nextLongitude))
  }, [averagedRouteImageLocation, hasHydratedLocationRef, latitude, longitude, setLatitude, setLongitude])

  useEffect(() => {
    if (!hasHydratedLocationRef.current) return
    if (effectiveMarkerPosition || !fallbackLocation) return

    setLatitude(formatCoordinate(fallbackLocation[0]))
    setLongitude(formatCoordinate(fallbackLocation[1]))
  }, [effectiveMarkerPosition, fallbackLocation, hasHydratedLocationRef, setLatitude, setLongitude])

  useEffect(() => {
    if (!hasHydratedLocationRef.current || !draftId || !draftUpdatedAt || !effectiveMarkerPosition || imagesPayload.length === 0) return

    const latitudeValue = effectiveMarkerPosition[0]
    const longitudeValue = effectiveMarkerPosition[1]
    const nextCragId = cragId ?? nearbyCragId
    const signature = JSON.stringify({
      latitude: latitudeValue,
      longitude: longitudeValue,
      countryId: atlasSync.atlas?.countryId ?? null,
      countryCode: atlasSync.atlas?.countryCode ?? null,
      countryName: atlasSync.atlas?.countryName ?? null,
      adminRegionName: atlasSync.atlas?.adminRegionName ?? null,
      unRegionName: atlasSync.atlas?.unRegionName ?? null,
      continentName: atlasSync.atlas?.continentName ?? null,
      cragId: nextCragId,
    })

    if (signature === lastLocationSyncRef.current) return

    const timer = window.setTimeout(async () => {
      lastLocationSyncRef.current = signature
      const atlasForPatch = atlasSync.atlas

      const nextRouteType = !hasExplicitRouteType && nearbyCragDominantRouteType ? nearbyCragDominantRouteType : routeType
      const response = await csrfFetch(`/api/submissions/drafts/${draftId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expected_updated_at: draftUpdatedAt,
          images: imagesPayload,
          metadata: {
            submission: {
              routeType: nextRouteType,
              isAnonymousSubmission,
              contributionCreditPlatform: creditPlatform,
              contributionCreditHandle: creditHandle,
              location: {
                latitude: latitudeValue,
                longitude: longitudeValue,
                countryId: atlasForPatch?.countryId ?? null,
                countryCode: atlasForPatch?.countryCode ?? null,
                countryName: atlasForPatch?.countryName ?? null,
                adminRegionName: atlasForPatch?.adminRegionName ?? null,
                unRegionName: atlasForPatch?.unRegionName ?? null,
                continentName: atlasForPatch?.continentName ?? null,
              },
            },
          },
          cragId: nextCragId,
        }),
      })

      const payload = await response.json().catch(() => ({}))
      if (response.ok && payload?.draft?.updated_at) {
        setDraftUpdatedAt(payload.draft.updated_at)
      } else {
        lastLocationSyncRef.current = null
      }
      if (!hasExplicitRouteType && nearbyCragDominantRouteType && response.ok) {
        setRouteType(nextRouteType)
      }
      if (!cragId && nearbyCragId) {
        setCragId(nearbyCragId)
        setSelectedCrag((current) => current || {
          id: nearbyCragId,
          name: nearbyCragName || 'Suggested crag',
          latitude: latitudeValue ?? 0,
          longitude: longitudeValue ?? 0,
        })
      }
    }, 400)

    return () => window.clearTimeout(timer)
  // draftUpdatedAt and atlasSync.atlas are intentionally read at execution time
  // to avoid retriggering this sync effect after a successful PATCH.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cragId, draft, draftId, effectiveMarkerPosition, hasExplicitRouteType, imagesPayload.length, imagesPayloadSignature, nearbyCragDominantRouteType, nearbyCragId, nearbyCragName, hasHydratedLocationRef, routeType, setDraftUpdatedAt, setRouteType])

  const handleMapClick = useCallback((event: L.LeafletMouseEvent) => {
    if (activeDraftImageId && activeImageLocationMode === 'custom') {
      setCustomGpsByImageId((prev) => ({
        ...prev,
        [activeDraftImageId]: {
          latitude: event.latlng.lat,
          longitude: event.latlng.lng,
        },
      }))
      return
    }
    updateDraftLocation(event.latlng.lat, event.latlng.lng)
  }, [activeDraftImageId, activeImageLocationMode, updateDraftLocation, setCustomGpsByImageId])

  const handleMarkerDragEnd = useCallback((event: L.LeafletEvent) => {
    const marker = event.target as L.Marker
    const position = marker.getLatLng()
    if (activeDraftImageId && activeImageLocationMode === 'custom') {
      setCustomGpsByImageId((prev) => ({
        ...prev,
        [activeDraftImageId]: {
          latitude: position.lat,
          longitude: position.lng,
        },
      }))
      return
    }
    updateDraftLocation(position.lat, position.lng)
  }, [activeDraftImageId, activeImageLocationMode, updateDraftLocation, setCustomGpsByImageId])

  const handleSearchLocation = useCallback(async () => {
    const query = searchQuery.trim()
    if (!query) return

    setSearchingLocation(true)
    setLocationSearchError(null)
    try {
      const response = await fetch(`/api/locations/search?q=${encodeURIComponent(query)}`)
      const payload = await response.json().catch(() => ({} as DraftLocationSearchResponse))
      const firstResult = Array.isArray(payload.results) ? payload.results[0] : null

      if (!response.ok || !firstResult?.lat || !firstResult?.lon) {
        throw new Error('No location found')
      }

      const lat = Number(firstResult.lat)
      const lng = Number(firstResult.lon)
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        throw new Error('Invalid location coordinates')
      }

      updateDraftLocation(lat, lng)
      setMapOpen(true)
    } catch (err) {
      setLocationSearchError(err instanceof Error ? err.message : 'Failed to search location')
    } finally {
      setSearchingLocation(false)
    }
  }, [searchQuery, setLocationSearchError, setMapOpen, setSearchingLocation, updateDraftLocation])

  return {
    activeImageCustomPosition,
    handleMapClick,
    handleMarkerDragEnd,
    handleSearchLocation,
  }
}
