'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { getMapBaseLayerConfig } from '@/lib/map/base-layer'

import 'leaflet/dist/leaflet.css'

const MapContainer = dynamic(() => import('react-leaflet').then((mod) => mod.MapContainer), { ssr: false })
const TileLayer = dynamic(() => import('react-leaflet').then((mod) => mod.TileLayer), { ssr: false })
const Marker = dynamic(() => import('react-leaflet').then((mod) => mod.Marker), { ssr: false })

export interface OfflineCragMapPin {
  id: string
  label: string
  latitude: number
  longitude: number
}

let L: typeof import('leaflet') | null = null

interface OfflineCragMapSnippetProps {
  pins: OfflineCragMapPin[]
  highlightedPinId?: string | null
  onSelectPin?: (pinId: string) => void
  className?: string
}

export default function OfflineCragMapSnippet({ pins, highlightedPinId = null, onSelectPin, className }: OfflineCragMapSnippetProps) {
  const mapRef = useRef<import('leaflet').Map | null>(null)
  const [mapReady, setMapReady] = useState(false)
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null)
  const [locationStatus, setLocationStatus] = useState<'idle' | 'requesting' | 'ready' | 'error'>('idle')

  useEffect(() => {
    if (typeof window === 'undefined') return
    void import('leaflet').then((leaflet) => {
      L = leaflet as typeof import('leaflet')
    })
  }, [])

  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return
    setLocationStatus('requesting')

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        setUserLocation([position.coords.latitude, position.coords.longitude])
        setLocationStatus('ready')
      },
      () => setLocationStatus('error'),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }
    )

    return () => {
      navigator.geolocation.clearWatch(watchId)
    }
  }, [])

  const center = useMemo<[number, number]>(() => {
    if (pins.length === 0) return [0, 0]
    const latitude = pins.reduce((sum, pin) => sum + pin.latitude, 0) / pins.length
    const longitude = pins.reduce((sum, pin) => sum + pin.longitude, 0) / pins.length
    return [latitude, longitude]
  }, [pins])
  const baseLayer = useMemo(() => getMapBaseLayerConfig({ offline: true }), [])

  useEffect(() => {
    if (!mapRef.current || pins.length === 0 || !L) return
    const points = pins.map((pin) => [pin.latitude, pin.longitude] as [number, number])
    if (userLocation) points.push(userLocation)
    mapRef.current.fitBounds(L.latLngBounds(points), { padding: [28, 28], maxZoom: 17 })
  }, [pins, userLocation, mapReady])

  if (pins.length === 0) {
    return null
  }

  return (
    <div className={className}>
      <div className="relative overflow-hidden rounded-2xl border border-gray-200 bg-gray-100 dark:border-gray-800 dark:bg-gray-900">
        <MapContainer
          ref={mapRef as never}
          center={center}
          zoom={16}
          style={{ height: '260px', width: '100%' }}
          preferCanvas={true}
          scrollWheelZoom={false}
          zoomControl={false}
          whenReady={() => setMapReady(true)}
        >
          <TileLayer
            url={baseLayer.imageryUrl}
            attribution={baseLayer.imageryAttribution}
            maxZoom={17}
          />
          {baseLayer.labelsUrl ? <TileLayer url={baseLayer.labelsUrl} attribution={baseLayer.labelsAttribution || undefined} maxZoom={17} /> : null}
          {pins.map((pin, index) => (
            <Marker
              key={pin.id}
              position={[pin.latitude, pin.longitude]}
              icon={L?.divIcon({
                className: 'offline-crag-map-pin',
                html: `<div style="background:${highlightedPinId === pin.id ? '#0f766e' : '#1d4ed8'};width:28px;height:28px;border-radius:9999px;display:flex;align-items:center;justify-content:center;color:white;font-size:11px;font-weight:700;border:2px solid white;box-shadow:0 4px 14px rgba(15,23,42,0.28);">${index + 1}</div>`,
                iconSize: [28, 28],
                iconAnchor: [14, 14],
              })}
              eventHandlers={onSelectPin ? { click: () => onSelectPin(pin.id) } : undefined}
            />
          ))}
          {userLocation ? (
            <Marker
              position={userLocation}
              icon={L?.divIcon({
                className: 'offline-user-map-pin',
                html: '<div style="width:18px;height:18px;border-radius:9999px;background:#2563eb;border:3px solid white;box-shadow:0 0 0 8px rgba(37,99,235,0.18);"></div>',
                iconSize: [18, 18],
                iconAnchor: [9, 9],
              })}
            />
          ) : null}
        </MapContainer>

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
