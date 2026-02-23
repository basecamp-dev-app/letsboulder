'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import 'leaflet/dist/leaflet.css'
import { useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import { Loader2, Search } from 'lucide-react'

const MapContainer = dynamic(() => import('react-leaflet').then(mod => mod.MapContainer), { ssr: false })
const TileLayer = dynamic(() => import('react-leaflet').then(mod => mod.TileLayer), { ssr: false })
const Marker = dynamic(() => import('react-leaflet').then(mod => mod.Marker), { ssr: false })

interface AdminGymLocationPickerProps {
  value: { latitude: number; longitude: number } | null
  onChange: (next: { latitude: number; longitude: number }) => void
}

interface LocationSearchResult {
  lat: number
  lon: number
  name: string
  display_name: string
}

function MapClickHandler({ onClick }: { onClick: (event: L.LeafletMouseEvent) => void }) {
  useMapEvents({ click: onClick })
  return null
}

function MapRecenter({ position }: { position: [number, number] | null }) {
  const map = useMapEvents({})

  useEffect(() => {
    if (!position) return
    map.setView(position, Math.max(map.getZoom(), 14))
  }, [map, position])

  return null
}

export default function AdminGymLocationPicker({ value, onChange }: AdminGymLocationPickerProps) {
  const [leaflet, setLeaflet] = useState<typeof import('leaflet') | null>(null)
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [searchResults, setSearchResults] = useState<LocationSearchResult[]>([])
  const [searchError, setSearchError] = useState<string | null>(null)

  useEffect(() => {
    import('leaflet').then(lib => setLeaflet(lib))
  }, [])

  const handleMapClick = useCallback((event: L.LeafletMouseEvent) => {
    onChange({ latitude: event.latlng.lat, longitude: event.latlng.lng })
  }, [onChange])

  const handleDragEnd = useCallback((event: L.LeafletEvent) => {
    const target = event.target as L.Marker
    const latLng = target.getLatLng()
    onChange({ latitude: latLng.lat, longitude: latLng.lng })
  }, [onChange])

  const markerPosition: [number, number] | null = value ? [value.latitude, value.longitude] : null
  const defaultCenter: [number, number] = markerPosition || [54.5, -2.5]
  const defaultZoom = markerPosition ? 14 : 6

  const canSearch = useMemo(() => query.trim().length >= 2, [query])

  async function handleSearch() {
    const trimmedQuery = query.trim()
    if (trimmedQuery.length < 2) {
      setSearchError('Type at least 2 characters to search.')
      return
    }

    setSearching(true)
    setSearchError(null)

    try {
      const response = await fetch(`/api/locations/search?q=${encodeURIComponent(trimmedQuery)}`)
      if (!response.ok) {
        const payload = await response.json().catch(() => ({} as { error?: string }))
        setSearchError(payload.error || 'Failed to search places')
        setSearchResults([])
        return
      }

      const payload = await response.json() as { results?: LocationSearchResult[] }
      setSearchResults(payload.results || [])
      if (!payload.results || payload.results.length === 0) {
        setSearchError('No places found. Try a broader query.')
      }
    } catch {
      setSearchError('Failed to search places')
      setSearchResults([])
    } finally {
      setSearching(false)
    }
  }

  function selectSearchResult(result: LocationSearchResult) {
    onChange({ latitude: result.lat, longitude: result.lon })
    setQuery(result.display_name)
    setSearchResults([])
    setSearchError(null)
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
            <input
              value={query}
              onChange={event => setQuery(event.target.value)}
              onKeyDown={event => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  handleSearch().catch(() => {})
                }
              }}
              placeholder="Search place name"
              className="w-full rounded-lg border border-gray-700 bg-gray-950 py-2 pl-9 pr-3 text-sm text-white placeholder-gray-500"
            />
          </div>
          <button
            type="button"
            onClick={() => handleSearch().catch(() => {})}
            disabled={searching || !canSearch}
            className="inline-flex items-center rounded-lg bg-gray-800 px-3 py-2 text-sm text-white hover:bg-gray-700 disabled:opacity-50"
          >
            {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Search'}
          </button>
        </div>

        {searchResults.length > 0 ? (
          <div className="max-h-48 overflow-auto rounded-lg border border-gray-800 bg-gray-950">
            {searchResults.map(result => (
              <button
                key={`${result.lat}-${result.lon}-${result.display_name}`}
                type="button"
                onClick={() => selectSearchResult(result)}
                className="block w-full border-b border-gray-800 px-3 py-2 text-left text-xs text-gray-300 hover:bg-gray-900 last:border-b-0"
              >
                {result.display_name}
              </button>
            ))}
          </div>
        ) : null}

        {searchError ? <p className="text-xs text-yellow-300">{searchError}</p> : null}
      </div>

      <div className="h-72 overflow-hidden rounded-lg border border-gray-700 bg-gray-950">
        <MapContainer center={defaultCenter} zoom={defaultZoom} style={{ height: '100%', width: '100%' }}>
          <MapRecenter position={markerPosition} />
          <MapClickHandler onClick={handleMapClick} />
          <TileLayer
            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            attribution="Imagery © Esri"
            maxZoom={19}
          />
          <TileLayer
            url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"
            attribution="Labels © Esri"
            maxZoom={19}
          />
          {markerPosition && leaflet ? (
            <Marker
              position={markerPosition}
              draggable={true}
              icon={leaflet.divIcon({
                className: 'location-marker',
                iconSize: [20, 20],
                iconAnchor: [10, 10],
              })}
              eventHandlers={{ dragend: handleDragEnd }}
            />
          ) : null}
        </MapContainer>
      </div>

      <p className="text-xs text-gray-400">
        {value
          ? `Pinned at ${value.latitude.toFixed(6)}, ${value.longitude.toFixed(6)}`
          : 'Click on the map to place a gym pin. You can drag the pin to refine it.'}
      </p>
    </div>
  )
}
