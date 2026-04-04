'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'

import 'leaflet/dist/leaflet.css'

const MapContainer = dynamic(() => import('react-leaflet').then((mod) => mod.MapContainer), { ssr: false })
const TileLayer = dynamic(() => import('react-leaflet').then((mod) => mod.TileLayer), { ssr: false })
const Marker = dynamic(() => import('react-leaflet').then((mod) => mod.Marker), { ssr: false })
const CircleMarker = dynamic(() => import('react-leaflet').then((mod) => mod.CircleMarker), { ssr: false })

import { haversineMeters } from '@/lib/geo/haversine'

let L: typeof import('leaflet') | null = null

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
  const mapRef = useRef<import('leaflet').Map | null>(null)
  const [mapReady, setMapReady] = useState(false)
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return
    void import('leaflet').then((leaflet) => {
      L = leaflet as typeof import('leaflet')
    })
  }, [])

  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setUserLocation([position.coords.latitude, position.coords.longitude])
      },
      () => {
        setUserLocation(null)
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    )
  }, [])

  const climbPosition = useMemo<[number, number]>(() => [latitude, longitude], [latitude, longitude])

  const nearbyUserLocation = useMemo(() => {
    if (!userLocation) return null
    const distance = getDistanceMeters(latitude, longitude, userLocation[0], userLocation[1])
    return distance <= NEARBY_DISTANCE_METERS ? userLocation : null
  }, [latitude, longitude, userLocation])

  useEffect(() => {
    if (!mapRef.current || !mapReady || !L) return

    if (nearbyUserLocation) {
      mapRef.current.fitBounds(L.latLngBounds([climbPosition, nearbyUserLocation]), {
        padding: [24, 24],
        maxZoom: 17,
      })
      return
    }

    mapRef.current.setView(climbPosition, 17)
  }, [climbPosition, mapReady, nearbyUserLocation])

  return (
    <div className={className}>
      <div className="overflow-hidden rounded-2xl border border-stone-200 bg-stone-100 shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <div className="flex items-center justify-between border-b border-stone-200/80 bg-white/90 px-3 py-2 text-xs font-medium text-stone-700 dark:border-gray-800 dark:bg-gray-950/90 dark:text-gray-300">
          <span>Image location</span>
          <span>{nearbyUserLocation ? 'You nearby' : 'Climb pin'}</span>
        </div>
        <MapContainer
          ref={mapRef as never}
          center={climbPosition}
          zoom={17}
          style={{ height: '144px', width: '100%' }}
          preferCanvas={true}
          scrollWheelZoom={false}
          doubleClickZoom={false}
          dragging={false}
          touchZoom={false}
          boxZoom={false}
          keyboard={false}
          zoomControl={false}
          attributionControl={false}
          whenReady={() => setMapReady(true)}
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; OpenStreetMap contributors'
            maxZoom={19}
          />
          <Marker
            position={climbPosition}
            icon={L?.divIcon({
              className: 'climb-location-pin',
              html: '<div style="width:18px;height:18px;border-radius:9999px;background:#dc2626;border:3px solid white;box-shadow:0 6px 16px rgba(15,23,42,0.28);"></div>',
              iconSize: [18, 18],
              iconAnchor: [9, 9],
            })}
          />
          {nearbyUserLocation ? (
            <CircleMarker
              center={nearbyUserLocation}
              radius={7}
              pathOptions={{
                color: '#ffffff',
                weight: 2,
                fillColor: '#2563eb',
                fillOpacity: 0.95,
              }}
            />
          ) : null}
        </MapContainer>
      </div>
    </div>
  )
}
