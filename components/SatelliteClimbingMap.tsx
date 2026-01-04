'use client'

import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import dynamic from 'next/dynamic'
import { createClient } from '@/lib/supabase'
import Image from 'next/image'
import L from 'leaflet'

// Import Leaflet CSS
import 'leaflet/dist/leaflet.css'

// Fix default markers (fallback to red)
delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
})

// Dynamically import Leaflet components to avoid SSR issues
const MapContainer = dynamic(() => import('react-leaflet').then(mod => mod.MapContainer), { ssr: false })
const TileLayer = dynamic(() => import('react-leaflet').then(mod => mod.TileLayer), { ssr: false })
const CircleMarker = dynamic(() => import('react-leaflet').then(mod => mod.CircleMarker), { ssr: false })
const Marker = dynamic(() => import('react-leaflet').then(mod => mod.Marker), { ssr: false })
const Tooltip = dynamic(() => import('react-leaflet').then(mod => mod.Tooltip), { ssr: false })


interface Climb {
  id: string
  name: string
  grade?: string
  image_url?: string
  description?: string
  crags: { name: string; latitude: number; longitude: number }
  _fullLoaded?: boolean // Track if full details are loaded
}

export default function SatelliteClimbingMap() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const [climbs, setClimbs] = useState<Climb[]>([])
  const [loading, setLoading] = useState(true)
  const [isClient, setIsClient] = useState(true)
  const [selectedClimb, setSelectedClimb] = useState<Climb | null>(null)
  const [imageError, setImageError] = useState(false)
  const [debounceTimer, setDebounceTimer] = useState<NodeJS.Timeout | null>(null)
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null)
  const [locationStatus, setLocationStatus] = useState<'idle' | 'requesting' | 'tracking' | 'error'>('idle')
  const [mapReady, setMapReady] = useState(true)

  // Cache key for localStorage
  const CACHE_KEY = 'gsyrocks_climbs_cache'
  const CACHE_DURATION = 24 * 60 * 60 * 1000 // 24 hours

  // Load full details for a specific climb
  const loadClimbDetails = useCallback(async (climbId: string) => {
    try {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('climbs')
        .select(`
          id, grade, image_url, description
        `)
        .eq('id', climbId)
        .single()

      if (error) {
        console.error('Supabase error fetching climb details:', error)
        // Return a partial object to mark as loaded and prevent infinite re-fetch
        return { id: climbId, grade: '', image_url: undefined, description: undefined }
      }

      return data as { id: string; grade?: string; image_url?: string; description?: string }
    } catch (err) {
      console.error('Network error loading climb details:', err)
      // Return a partial object to mark as loaded and prevent infinite re-fetch
      return { id: climbId, image_url: undefined, description: undefined }
    }
  }, [])

  // Load climbs from cache or API (basic data only)
  const loadClimbs = useCallback(async (bounds?: L.LatLngBounds, forceRefresh = false) => {
    // Check cache first (unless force refresh)
    if (!forceRefresh) {
      const cached = localStorage.getItem(CACHE_KEY)
      if (cached) {
        const { data, timestamp } = JSON.parse(cached)
        if (Date.now() - timestamp < CACHE_DURATION) {
          console.log('Loading climbs from cache')
          setClimbs(data)
          setLoading(false)
          return
        }
      }
    }

    try {
      const supabase = createClient()
      let query = supabase
        .from('climbs')
        .select(`
          id, name, grade,
          crags (name, latitude, longitude)
        `)
        .eq('status', 'approved')

      // If bounds provided, filter by viewport (with buffer)
      if (bounds) {
        const north = bounds.getNorth()
        const south = bounds.getSouth()
        const east = bounds.getEast()
        const west = bounds.getWest()

        // Add 20% buffer to viewport
        const latBuffer = (north - south) * 0.2
        const lngBuffer = (east - west) * 0.2

        query = query
          .gte('crags.latitude', south - latBuffer)
          .lte('crags.latitude', north + latBuffer)
          .gte('crags.longitude', west - lngBuffer)
          .lte('crags.longitude', east + lngBuffer)
      }

      const { data, error } = await query

      if (error) {
        console.error('Error fetching climbs:', error)
      } else {
        const climbsData = (data || []).map((climb: any) => ({
          ...climb,
          _fullLoaded: false // Mark as not fully loaded
        })) as Climb[]
        console.log(`Loaded ${climbsData.length} climbs (basic data)${bounds ? ' for viewport' : ''}`)
        setClimbs(climbsData)

        // Cache the data
        localStorage.setItem(CACHE_KEY, JSON.stringify({
          data: climbsData,
          timestamp: Date.now()
        }))
      }
    } catch (err) {
      console.error('Network error fetching climbs:', err)
    }
    setLoading(false)
  }, [])

  // Auto-detect location on mount
  useEffect(() => {
    if (!isClient || !mapReady) return

    if (!navigator.geolocation) {
      console.log('Geolocation not supported')
      return
    }

    setTimeout(() => {
      setLocationStatus('requesting')
    }, 0)

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude, accuracy } = position.coords
        setUserLocation([latitude, longitude])
        setLocationStatus('tracking')
        console.log('Location detected:', latitude, longitude, 'accuracy:', accuracy, 'meters')

        // Center map on user location
        if (mapRef.current) {
          mapRef.current.setView([latitude, longitude], 12)
        }
      },
      (error) => {
        console.error('Error getting location:', error)
        setLocationStatus('error')
      },
      { enableHighAccuracy: true, timeout: 15000 }
    )
  }, [isClient, mapReady])

  // Simple clustering function
  const clusterMarkers = useCallback((markers: Climb[], map: L.Map) => {
    const clusters: { center: L.LatLng; climbs: Climb[]; count: number }[] = []
    const clusterDistance = 50 // pixels

    markers.forEach(climb => {
      const point = map.latLngToContainerPoint([climb.crags.latitude, climb.crags.longitude])
      let added = false

      for (const cluster of clusters) {
        const clusterPoint = map.latLngToContainerPoint(cluster.center)
        const distance = Math.sqrt(
          Math.pow(point.x - clusterPoint.x, 2) + Math.pow(point.y - clusterPoint.y, 2)
        )

        if (distance < clusterDistance) {
          cluster.climbs.push(climb)
          cluster.count++
          // Recalculate center
          const totalLat = cluster.climbs.reduce((sum, c) => sum + c.crags.latitude, 0)
          const totalLng = cluster.climbs.reduce((sum, c) => sum + c.crags.longitude, 0)
          cluster.center = L.latLng(totalLat / cluster.count, totalLng / cluster.count)
          added = true
          break
        }
      }

      if (!added) {
        clusters.push({
          center: L.latLng(climb.crags.latitude, climb.crags.longitude),
          climbs: [climb],
          count: 1
        })
      }
    })

    return clusters
  }, [])

  // Debounced map move handler
  const handleMapMove = useCallback((map: L.Map) => {
    if (debounceTimer) clearTimeout(debounceTimer)

    const timer = setTimeout(() => {
      const bounds = map.getBounds()
      console.log('Map moved, loading climbs for viewport')
      loadClimbs(bounds)
      setDebounceTimer(null)
    }, 500) // 500ms debounce

    setDebounceTimer(timer)
  }, [debounceTimer, loadClimbs])

  useEffect(() => {
    if (!isClient) return

    // Initial load with world bounds
    const worldBounds = L.latLngBounds(L.latLng(-90, -180), L.latLng(90, 180))
    loadClimbs(worldBounds)

    // Optionally get location on load (commented out to avoid auto-prompt)
    // startLocationTracking()
  }, [isClient, loadClimbs])

  // Auto-detect location on mount
  useEffect(() => {
    if (!isClient || !mapReady) return

    if (!navigator.geolocation) {
      console.log('Geolocation not supported')
      return
    }

    setTimeout(() => {
      setLocationStatus('requesting')
    }, 0)

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude, accuracy } = position.coords
        setUserLocation([latitude, longitude])
        setLocationStatus('tracking')
        console.log('Location detected:', latitude, longitude, 'accuracy:', accuracy, 'meters')

        // Center map on user location
        if (mapRef.current) {
          mapRef.current.setView([latitude, longitude], 12)
        }
      },
      (error) => {
        console.error('Error getting location:', error)
        setLocationStatus('error')
      },
      { enableHighAccuracy: true, timeout: 15000 }
    )
  }, [isClient, mapReady])

  if (!isClient || loading || !mapReady) {
    return <div className="h-screen w-full flex items-center justify-center">Loading satellite map...</div>
  }



  // Guernsey center coordinates
  const worldCenter: [number, number] = [49.4657, -2.5853]
  const zoom = 11

  return (
    <div className="h-screen w-full relative">
      <MapContainer
        center={worldCenter}
        zoom={zoom}
        style={{ height: '100%', width: '100%' }}
        zoomControl={true}
        scrollWheelZoom={true}
      >
        <TileLayer
          url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
          attribution='Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics, and others'
          maxZoom={19}
          minZoom={1}
        />

        {userLocation && (
          <Marker
            position={userLocation}
            icon={L.divIcon({
              className: 'user-location-dot',
              iconSize: [12, 12],
              iconAnchor: [6, 6]
            })}
          />
        )}

        {climbs.map(climb => (
          <CircleMarker
            key={climb.id}
            center={[climb.crags.latitude, climb.crags.longitude]}
            radius={7}
            pathOptions={{ color: '#dc2626', fillColor: '#dc2626', fillOpacity: 1, weight: 0 }}
            eventHandlers={{
              click: async (e: L.LeafletMouseEvent) => {
                console.log('Marker clicked for climb:', climb.name, 'image_url:', climb.image_url);
                e.originalEvent.stopPropagation();
                setSelectedClimb(climb);
                if (!climb._fullLoaded) {
                  const details = await loadClimbDetails(climb.id);
                  if (details) {
                    const fullClimb = { ...climb, ...details, _fullLoaded: true };
                    setClimbs(prev => prev.map(c => c.id === climb.id ? fullClimb : c));
                    setSelectedClimb(fullClimb);
                  } else {
                    setSelectedClimb({ ...climb, _fullLoaded: true });
                  }
                }
                setImageError(false);
                if (mapRef.current) {
                  mapRef.current.setView([climb.crags.latitude, climb.crags.longitude], Math.min(mapRef.current.getZoom() + 4, 18))
                }
              },
              mouseover: async () => {
                if (!climb._fullLoaded && !climb.image_url) {
                  const details = await loadClimbDetails(climb.id);
                  if (details) {
                    const fullClimb = { ...climb, ...details, _fullLoaded: true };
                    setClimbs(prev => prev.map(c => c.id === climb.id ? fullClimb : c));
                  }
                }
              },
            }}
          >
            <Tooltip direction="top" offset={[0, -10]} opacity={1} permanent={false}>
              <div className="w-40">
                {climb.image_url ? (
                  <div className="relative h-24 w-full mb-2 rounded overflow-hidden">
                    <Image
                      src={climb.image_url}
                      alt={climb.name}
                      fill
                      className="object-cover"
                      sizes="160px"
                    />
                  </div>
                ) : (
                  <div className="h-24 w-full bg-gray-200 flex items-center justify-center mb-2 rounded">
                    <span className="text-gray-500 text-xs">No image</span>
                  </div>
                )}
                <p className="font-semibold text-sm text-gray-900 truncate">{climb.name}</p>
                {climb.grade && (
                  <p className="text-xs text-gray-600">{climb.grade}</p>
                )}
              </div>
            </Tooltip>
          </CircleMarker>
        ))}
      </MapContainer>

      {locationStatus === 'requesting' && (
        <div className="absolute top-4 right-20 z-[1000] bg-blue-50 border border-blue-300 rounded-lg px-3 py-2 text-sm text-blue-800">
          Requesting location permission...
        </div>
      )}

        {selectedClimb && (
        <>
          {/* Background overlay - closes overlay when clicked */}
          <div
            className="fixed inset-0 bg-black bg-opacity-75 z-[1000]"
            onClick={() => setSelectedClimb(null)}
          ></div>

          {/* Image content - interactive */}
          <div className="fixed inset-0 z-[1001] pointer-events-none">
            {selectedClimb.image_url ? (
              <div className="absolute top-16 bottom-20 left-0 right-0 pointer-events-auto">
                <div className="relative w-full h-full">
                  <Image
                    src={selectedClimb.image_url}
                    alt={selectedClimb.name}
                    fill
                    className="object-contain"
                    sizes="100vw"
                    onLoadingComplete={() => console.log('Image loaded successfully:', selectedClimb.image_url)}
                    onError={() => {
                      console.log('Image failed to load:', selectedClimb.image_url);
                      setImageError(true);
                    }}
                    priority
                  />
                </div>
              </div>
            ) : (
              <div className="absolute inset-0 bg-gray-200 flex items-center justify-center pointer-events-auto">
                <div className="text-gray-600">
                  {selectedClimb._fullLoaded === false ? 'Loading image...' : 'No image available'}
                </div>
              </div>
            )}

            {/* UI elements - interactive */}
            <div className="absolute bottom-0 left-0 right-0 bg-white p-4 pointer-events-auto">
              <p className="text-black text-lg font-semibold">{selectedClimb.name}, {selectedClimb.grade}</p>
              {imageError && selectedClimb.image_url && (
                <p className="text-red-500 text-xs mt-1">
                  Image failed to load
                </p>
              )}
            </div>
            <button onClick={() => setSelectedClimb(null)} className="absolute top-4 right-4 text-white bg-black bg-opacity-50 rounded-full p-2 z-30 pointer-events-auto">X</button>
          </div>
        </>
      )}
    </div>
  )
}