'use client'

import { useEffect, useMemo, useState } from 'react'

import MapLibreVectorMap, { type MapLibreFitBounds } from '@/components/map/MapLibreVectorMap'

export interface OfflineCragMapPin {
  id: string
  label: string
  latitude: number
  longitude: number
}

interface OfflineCragMapSnippetProps {
  pins: OfflineCragMapPin[]
  highlightedPinId?: string | null
  onSelectPin?: (pinId: string) => void
  className?: string
}

function buildFitBounds(pins: Array<{ latitude: number; longitude: number }>): MapLibreFitBounds | null {
  if (pins.length === 0) return null

  const longitudes = pins.map((pin) => pin.longitude)
  const latitudes = pins.map((pin) => pin.latitude)
  return [
    [Math.min(...longitudes), Math.min(...latitudes)],
    [Math.max(...longitudes), Math.max(...latitudes)],
  ]
}

export default function OfflineCragMapSnippet({ pins, highlightedPinId = null, onSelectPin, className }: OfflineCragMapSnippetProps) {
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null)
  const [locationStatus, setLocationStatus] = useState<'idle' | 'requesting' | 'ready' | 'error'>('idle')

  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return
    const statusTimeoutId = window.setTimeout(() => setLocationStatus('requesting'), 0)

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        setUserLocation({ latitude: position.coords.latitude, longitude: position.coords.longitude })
        setLocationStatus('ready')
      },
      () => setLocationStatus('error'),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }
    )

    return () => {
      window.clearTimeout(statusTimeoutId)
      navigator.geolocation.clearWatch(watchId)
    }
  }, [])

  const center = useMemo<[number, number]>(() => {
    if (pins.length === 0) return [0, 0]
    const latitude = pins.reduce((sum, pin) => sum + pin.latitude, 0) / pins.length
    const longitude = pins.reduce((sum, pin) => sum + pin.longitude, 0) / pins.length
    return [longitude, latitude]
  }, [pins])

  const pinsGeoJson = useMemo<GeoJSON.FeatureCollection<GeoJSON.Point>>(() => ({
    type: 'FeatureCollection',
    features: [
      ...pins.map((pin, index) => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [pin.longitude, pin.latitude] },
        properties: {
          id: pin.id,
          selectId: pin.id,
          label: String(index + 1),
          active: highlightedPinId === pin.id,
          interactive: true,
        },
      })),
      ...(userLocation ? [{
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [userLocation.longitude, userLocation.latitude] },
        properties: {
          id: 'user-location',
          selectId: 'user-location',
          label: '',
          placeType: 'gym',
          interactive: false,
        },
      }] : []),
    ],
  }), [highlightedPinId, pins, userLocation])

  const fitBounds = useMemo(() => buildFitBounds(userLocation ? [...pins, userLocation] : pins), [pins, userLocation])

  if (pins.length === 0) return null

  return (
    <div className={className}>
      <div className="relative overflow-hidden rounded-2xl border border-gray-200 bg-gray-100 dark:border-gray-800 dark:bg-gray-900">
        <MapLibreVectorMap
          center={center}
          zoom={16}
          minZoom={1}
          maxZoom={17}
          fitBounds={fitBounds}
          pinsGeoJson={pinsGeoJson}
          offline={true}
          staticPreview={!onSelectPin}
          className="h-[260px] w-full"
          onPinSelect={onSelectPin}
        />

        <div className="absolute left-3 top-3 rounded-full bg-white/92 px-3 py-1 text-xs font-semibold text-gray-900 shadow-sm backdrop-blur dark:bg-gray-950/90 dark:text-gray-100">
          Saved climb pins
        </div>
        <div className="absolute bottom-3 left-3 rounded-full bg-white/92 px-3 py-1 text-xs text-gray-700 shadow-sm backdrop-blur dark:bg-gray-950/90 dark:text-gray-200">
          {locationStatus === 'ready' ? 'GPS active' : locationStatus === 'requesting' ? 'Finding your location...' : locationStatus === 'error' ? 'GPS unavailable' : 'GPS idle'}
        </div>
      </div>
    </div>
  )
}
