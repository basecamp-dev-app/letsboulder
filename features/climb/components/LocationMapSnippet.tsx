'use client'

import { useEffect, useMemo, useState } from 'react'

import MapLibreStaticLocationMap from '@/components/map/MapLibreStaticLocationMap'
import { haversineMeters } from '@/lib/geo/haversine'

interface LocationMapSnippetProps {
  latitude: number
  longitude: number
  className?: string
}

const NEARBY_DISTANCE_METERS = 500

function getDistanceMeters(aLat: number, aLng: number, bLat: number, bLng: number) {
  return haversineMeters(aLat, aLng, bLat, bLng)
}

export default function LocationMapSnippet({ latitude, longitude, className }: LocationMapSnippetProps) {
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null)

  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setUserLocation({ latitude: position.coords.latitude, longitude: position.coords.longitude })
      },
      () => {
        setUserLocation(null)
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    )
  }, [])

  const climbPosition = useMemo(() => ({ latitude, longitude }), [latitude, longitude])

  const nearbyUserLocation = useMemo(() => {
    if (!userLocation) return null
    const distance = getDistanceMeters(latitude, longitude, userLocation.latitude, userLocation.longitude)
    return distance <= NEARBY_DISTANCE_METERS ? userLocation : null
  }, [latitude, longitude, userLocation])

  return (
    <div className={className}>
      <div className="overflow-hidden rounded-2xl border border-stone-200 bg-stone-100 shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <div className="flex items-center justify-between border-b border-stone-200/80 bg-white/90 px-3 py-2 text-xs font-medium text-stone-700 dark:border-gray-800 dark:bg-gray-950/90 dark:text-gray-300">
          <span>Image location</span>
          <span>{nearbyUserLocation ? 'You nearby' : 'Climb pin'}</span>
        </div>
        <MapLibreStaticLocationMap
          point={climbPosition}
          secondaryPoint={nearbyUserLocation}
          className="h-36 w-full"
        />
      </div>
    </div>
  )
}
