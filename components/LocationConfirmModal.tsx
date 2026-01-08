'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import dynamic from 'next/dynamic'
import 'leaflet/dist/leaflet.css'

const MapContainer = dynamic(() => import('react-leaflet').then(mod => mod.MapContainer), { ssr: false })
const TileLayer = dynamic(() => import('react-leaflet').then(mod => mod.TileLayer), { ssr: false })
const Marker = dynamic(() => import('react-leaflet').then(mod => mod.Marker), { ssr: false })

const DEFAULT_LAT = 49.45
const DEFAULT_LNG = -2.58
const DEFAULT_ZOOM = 10

interface LocationConfirmModalProps {
  latitude: number | null
  longitude: number | null
  imageUrl: string
  onConfirm: (latitude: number, longitude: number) => void
  onCancel: () => void
}

interface LocationInfo {
  displayName: string
  latitude: number
  longitude: number
}

export default function LocationConfirmModal({
  latitude,
  longitude,
  imageUrl,
  onConfirm,
  onCancel
}: LocationConfirmModalProps) {
  const [locationInfo, setLocationInfo] = useState<LocationInfo | null>(null)
  const [hasGps, setHasGps] = useState(false)
  const [adjustedLat, setAdjustedLat] = useState<number | null>(null)
  const [adjustedLng, setAdjustedLng] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [geocodeError, setGeocodeError] = useState<string | null>(null)
  const [leaflet, setLeaflet] = useState<typeof import('leaflet') | null>(null)
  const [markerPlaced, setMarkerPlaced] = useState(false)
  const mapRef = useRef<L.Map | null>(null)

  useEffect(() => {
    import('leaflet').then(L => {
      setLeaflet(L)
    })
  }, [])

  useEffect(() => {
    const hasGpsCoords = latitude !== null && longitude !== null
    setHasGps(hasGpsCoords)

    if (hasGpsCoords) {
      setAdjustedLat(latitude)
      setAdjustedLng(longitude)
      setMarkerPlaced(true)
    } else {
      setAdjustedLat(null)
      setAdjustedLng(null)
      setMarkerPlaced(false)
    }
  }, [latitude, longitude])

  useEffect(() => {
    const fetchLocationName = async () => {
      const lat = adjustedLat ?? DEFAULT_LAT
      const lng = adjustedLng ?? DEFAULT_LNG

      try {
        const response = await fetch(
          `/api/locations/reverse?lat=${lat}&lng=${lng}`
        )
        if (response.ok) {
          const data = await response.json()
          setLocationInfo({
            displayName: data.display_name || 'Unknown location',
            latitude: lat,
            longitude: lng
          })
        } else {
          setGeocodeError('Could not fetch location name')
          setLocationInfo({
            displayName: `${lat.toFixed(4)}, ${lng.toFixed(4)}`,
            latitude: lat,
            longitude: lng
          })
        }
      } catch {
        setGeocodeError('Location service unavailable')
        setLocationInfo({
          displayName: `${lat.toFixed(4)}, ${lng.toFixed(4)}`,
          latitude: lat,
          longitude: lng
        })
      } finally {
        setLoading(false)
      }
    }

    fetchLocationName()
  }, [adjustedLat, adjustedLng])

  useEffect(() => {
    if (!hasGps && mapRef.current && leaflet) {
      const handleMapClick = (e: L.LeafletMouseEvent) => {
        const { lat, lng } = e.latlng
        setAdjustedLat(lat)
        setAdjustedLng(lng)
        setMarkerPlaced(true)
      }
      mapRef.current.on('click', handleMapClick)
      return () => {
        mapRef.current?.off('click', handleMapClick)
      }
    }
  }, [hasGps, leaflet])

  const handleMarkerDrag = useCallback((e: any) => {
    if (!leaflet) return
    const marker = e.target
    const position = marker.getLatLng()
    setAdjustedLat(position.lat)
    setAdjustedLng(position.lng)
  }, [leaflet])

  const handleConfirm = () => {
    if (adjustedLat !== null && adjustedLng !== null) {
      onConfirm(adjustedLat, adjustedLng)
    }
  }

  const mapCenter: [number, number] = [
    adjustedLat ?? DEFAULT_LAT,
    adjustedLng ?? DEFAULT_LNG
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div 
        className="bg-white dark:bg-gray-900 rounded-lg shadow-xl w-full max-w-2xl mx-4 overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
            {hasGps ? 'Confirm Location' : 'Place Location'}
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {hasGps 
              ? 'GPS was found in your photo. Drag the marker to adjust if needed.'
              : 'No GPS data found. Click on the map to place the marker where this climb is located.'}
          </p>
        </div>

        <div className="relative h-64">
          <MapContainer
            center={mapCenter}
            zoom={hasGps ? 16 : DEFAULT_ZOOM}
            style={{ height: '100%', width: '100%', zIndex: 1 }}
            dragging={true}
            zoomControl={true}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {leaflet && adjustedLat !== null && adjustedLng !== null && (
              <Marker
                position={[adjustedLat, adjustedLng]}
                icon={leaflet.divIcon({
                  className: 'climb-marker',
                  iconSize: [12, 12],
                  iconAnchor: [6, 6]
                })}
                draggable={true}
                eventHandlers={{
                  dragend: handleMarkerDrag
                }}
              />
            )}
          </MapContainer>
          {!markerPlaced && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
              <div className="bg-black/60 text-white px-4 py-2 rounded-full text-sm">
                Click map to place marker
              </div>
            </div>
          )}
        </div>

        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          {loading ? (
            <p className="text-gray-500 dark:text-gray-400">Loading location details...</p>
          ) : (
            <div className="space-y-2">
              <div className="flex items-start gap-2">
                <span className="text-lg">📍</span>
                <div>
                  <p className="font-medium text-gray-900 dark:text-gray-100">
                    {locationInfo?.displayName}
                  </p>
                  {adjustedLat !== null && adjustedLng !== null && (
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {adjustedLat.toFixed(6)}, {adjustedLng.toFixed(6)}
                    </p>
                  )}
                </div>
              </div>
              {geocodeError && (
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {geocodeError}
                </p>
              )}
            </div>
          )}
        </div>

        <div className="p-4 flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!markerPlaced}
            className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {hasGps ? 'Confirm Location' : 'Place Location'}
          </button>
        </div>
      </div>
    </div>
  )
}
