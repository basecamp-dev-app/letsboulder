'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { MapPin, Search, Loader2 } from 'lucide-react'
import type { GpsData } from '@/lib/submission-types'
import dynamic from 'next/dynamic'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

const MapContainer = dynamic(() => import('react-leaflet').then(mod => mod.MapContainer), { ssr: false })
const TileLayer = dynamic(() => import('react-leaflet').then(mod => mod.TileLayer), { ssr: false })
const Marker = dynamic(() => import('react-leaflet').then(mod => mod.Marker), { ssr: false })

delete (L.Icon.Default.prototype as { _getIconUrl?: unknown })._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
})

interface LocationPickerProps {
  initialGps: GpsData | null
  onConfirm: (gps: GpsData) => void
  onSkip?: () => void
  regionName?: string
  cragName?: string
}

export default function LocationPicker({ initialGps, onConfirm, onSkip, regionName, cragName }: LocationPickerProps) {
  const [position, setPosition] = useState<[number, number] | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [isClient, setIsClient] = useState(false)
  const mapRef = useRef<L.Map | null>(null)
  
  useEffect(() => {
    setIsClient(true)
  }, [])
  
  useEffect(() => {
    if (initialGps) {
      setPosition([initialGps.latitude, initialGps.longitude])
    } else if (regionName && cragName) {
      handleSearchForCrag()
    }
  }, [initialGps, regionName, cragName])
  
  useEffect(() => {
    if (position && mapRef.current) {
      mapRef.current.setView(position, 14)
    }
  }, [position])
  
  const handlePositionChange = useCallback((e: L.LeafletEvent) => {
    const { lat, lng } = e.target.getLatLng()
    setPosition([lat, lng])
  }, [])

  const handleMapClick = useCallback((e: L.LeafletMouseEvent) => {
    const { lat, lng } = e.latlng
    setPosition([lat, lng])
  }, [])
  
  const handleSearch = async () => {
    if (!searchQuery.trim()) return
    
    setSearching(true)
    setSearchError(null)
    
    try {
      const response = await fetch(`/api/locations/search?q=${encodeURIComponent(searchQuery)}`)
      if (response.ok) {
        const data = await response.json()
        if (data && data.length > 0) {
          const { lat, lon } = data[0]
          setPosition([lat, lon])
        } else {
          setSearchError('Location not found')
        }
      } else {
        setSearchError('Search failed')
      }
    } catch {
      setSearchError('Failed to search location')
    } finally {
      setSearching(false)
    }
  }
  
  const handleSearchForCrag = async () => {
    if (!regionName || !cragName) return
    
    setSearching(true)
    setSearchError(null)
    
    try {
      const response = await fetch(`/api/locations/search?q=${encodeURIComponent(`${cragName}, ${regionName}`)}`)
      if (response.ok) {
        const data = await response.json()
        if (data && data.length > 0) {
          const { lat, lon } = data[0]
          setPosition([lat, lon])
        }
      }
    } catch {
      // Silently fail
    } finally {
      setSearching(false)
    }
  }
  
  const handleConfirm = () => {
    if (position) {
      onConfirm({ latitude: position[0], longitude: position[1] })
    }
  }
  
  if (!isClient) {
    return (
      <div className="h-80 bg-gray-100 dark:bg-gray-800 rounded-lg flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    )
  }
  
  return (
    <div className="space-y-4">
      <div className="h-80 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
        <MapContainer
          ref={mapRef}
          center={position || [51.505, -0.09]}
          zoom={position ? 14 : 2}
          style={{ height: '100%', width: '100%' }}
        >
          <TileLayer
            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            attribution='Tiles © Esri'
          />
          <Marker
            position={position || [51.505, -0.09]}
            draggable={true}
            eventHandlers={{
              dragend: handlePositionChange,
              click: handleMapClick
            }}
            opacity={position ? 1 : 0}
          />
        </MapContainer>
      </div>

      <div className="flex gap-2 pt-2">
        <button
          onClick={handleConfirm}
          disabled={!position}
          className="flex-1 py-2 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          <MapPin className="w-4 h-4" />
          Confirm Location
        </button>
      </div>

      <div className="flex gap-2">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="Search for a location..."
            className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
          />
        </div>
        <button
          onClick={handleSearch}
          disabled={searching}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Search'}
        </button>
      </div>
      
      {regionName && cragName && (
        <button
          onClick={handleSearchForCrag}
          disabled={searching}
          className="w-full py-2 px-4 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center justify-center gap-2"
        >
          <MapPin className="w-4 h-4" />
          Use "{cragName}" crag location
        </button>
      )}
      
      {position && (
        <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
          <p className="text-sm text-gray-600 dark:text-gray-400 flex items-center gap-2">
            <MapPin className="w-4 h-4" />
            <span>{position[0].toFixed(6)}, {position[1].toFixed(6)}</span>
          </p>
        </div>
      )}
      
      {searchError && (
        <div className="p-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">
          {searchError}
        </div>
      )}
    </div>
  )
}
