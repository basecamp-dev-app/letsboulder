'use client'

// Add MarkerClusterGroup type declaration
declare module 'leaflet' {
  interface MarkerClusterGroupOptions {
    disableClusteringAtZoom?: number
    maxClusterRadius?: number
    showCoverageOnHover?: boolean
    spiderfyOnMaxZoom?: boolean
    chunkedLoading?: boolean
    iconCreateFunction?: (cluster: any) => L.DivIcon
  }

  interface MarkerClusterGroup extends L.LayerGroup {
    addLayer(layer: L.Layer): this
    removeLayer(layer: L.Layer): this
    clearLayers(): this
    getChildCount(): number
    getLayers(): L.Layer[]
  }

  interface Map {
    addLayer(layer: L.Layer): this
    removeLayer(layer: L.Layer): this
  }

  function markerClusterGroup(options?: MarkerClusterGroupOptions): MarkerClusterGroup
}

import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import dynamic from 'next/dynamic'
import { createClient } from '@/lib/supabase'
import Image from 'next/image'
import L from 'leaflet'
import 'leaflet.markercluster'

// Import Leaflet CSS
import 'leaflet/dist/leaflet.css'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import 'leaflet.markercluster/dist/MarkerCluster.Default.css'

// Dynamically import Leaflet components to avoid SSR issues
const MapContainer = dynamic(() => import('react-leaflet').then(mod => mod.MapContainer), { ssr: false })
const TileLayer = dynamic(() => import('react-leaflet').then(mod => mod.TileLayer), { ssr: false })
const Marker = dynamic(() => import('react-leaflet').then(mod => mod.Marker), { ssr: false })

// Import useMap directly - it's a hook so it must be used inside MapContainer
import { useMap } from 'react-leaflet'

interface Climb {
  id: string
  name: string
  grade?: string
  image_url?: string
  description?: string
  crags: { name: string; latitude: number; longitude: number }
  _fullLoaded?: boolean // Track if full details are loaded
}

interface ClusterMapControllerProps {
  climbs: Climb[]
  visitedClimbs: Set<string>
  onClimbClick: (climb: Climb) => void
  onHover: (climbId: string | null, position: { x: number; y: number } | null) => void
}

function ClusterMapController({ climbs, visitedClimbs, onClimbClick, onHover }: ClusterMapControllerProps) {
  const map = useMap()
  const clusterGroupRef = useRef<L.MarkerClusterGroup | null>(null)

  useEffect(() => {
    if (!map) return

    // Create cluster group if it doesn't exist
    if (!clusterGroupRef.current) {
      const clusterGroup = L.markerClusterGroup({
        disableClusteringAtZoom: 18,
        maxClusterRadius: 60,
        showCoverageOnHover: false,
        spiderfyOnMaxZoom: false,
        chunkedLoading: true,
        iconCreateFunction: (cluster: any) => {
          return L.divIcon({
            className: 'cluster-marker',
            html: `<div class="cluster-inner"></div>`,
            iconSize: L.point(24, 24)
          })
        }
      })

      // Handle cluster click - zoom to bounds instead of spiderfying
      clusterGroup.on('clusterclick', (e: L.LeafletEvent) => {
        const layer = e.layer
        if ('getBounds' in layer) {
          const bounds = (layer as any).getBounds() as L.LatLngBounds
          map.fitBounds(bounds, { padding: [50, 50], maxZoom: 17 })
        }
      })

      clusterGroupRef.current = clusterGroup
      map.addLayer(clusterGroup)
    }

    const clusterGroup = clusterGroupRef.current

    // Clear existing markers
    clusterGroup.clearLayers()

    // Add new markers
    climbs.forEach(climb => {
      const marker = L.marker(
        [climb.crags.latitude, climb.crags.longitude],
        {
          icon: L.divIcon({
            className: `climb-dot ${visitedClimbs.has(climb.id) ? 'visited' : ''}`,
            html: `<div class="climb-dot-inner"></div>`,
            iconSize: [14, 14],
            iconAnchor: [7, 7]
          })
        }
      )

      marker.on('mouseover', () => {
        onHover(climb.id, null)
        const element = marker.getElement()
        if (element) {
          const rect = element.getBoundingClientRect()
          onHover(climb.id, { x: rect.left + rect.width / 2, y: rect.top - 10 })
        }
      })

      marker.on('mouseout', () => {
        onHover(null, null)
      })

      marker.on('click', () => {
        onClimbClick(climb)
      })

      clusterGroup.addLayer(marker)
    })

    return () => {
      if (clusterGroupRef.current) {
        map.removeLayer(clusterGroupRef.current)
        clusterGroupRef.current = null
      }
    }
  }, [map, climbs, visitedClimbs, onClimbClick, onHover])

  return null
}

export default function SatelliteClimbingMap() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)
  const [climbs, setClimbs] = useState<Climb[]>([])
  const [loading, setLoading] = useState(true)
  const [isClient, setIsClient] = useState(false)
  const [selectedClimb, setSelectedClimb] = useState<Climb | null>(null)
  const [imageError, setImageError] = useState(false)
  const [debounceTimer, setDebounceTimer] = useState<NodeJS.Timeout | null>(null)
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null)
  const [locationStatus, setLocationStatus] = useState<'idle' | 'requesting' | 'tracking' | 'error'>('idle')
  const [visitedClimbs, setVisitedClimbs] = useState<Set<string>>(new Set())
  const [hoveredClimb, setHoveredClimb] = useState<string | null>(null)
  const [tooltipPosition, setTooltipPosition] = useState<{x: number, y: number} | null>(null)

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
        return { id: climbId, grade: '', image_url: undefined, description: undefined }
      }

      return data as { id: string; grade?: string; image_url?: string; description?: string }
    } catch (err) {
      console.error('Network error loading climb details:', err)
      return { id: climbId, image_url: undefined, description: undefined }
    }
  }, [])

  // Handle marker click - mark as visited
  const handleClimbClick = useCallback((climb: Climb) => {
    // Mark as visited
    setVisitedClimbs(prev => new Set([...prev, climb.id]))

    // Set selected climb
    setSelectedClimb(climb)

    // Load full details
    if (!climb._fullLoaded) {
      loadClimbDetails(climb.id).then(details => {
        if (details) {
          const fullClimb = { ...climb, ...details, _fullLoaded: true }
          setClimbs(prev => prev.map(c => c.id === climb.id ? fullClimb : c))
          setSelectedClimb(fullClimb)
        }
      })
    }

    setImageError(false)
  }, [loadClimbDetails])

  // Load climbs from cache or API (basic data only)
  const loadClimbs = useCallback(async (bounds?: L.LatLngBounds, forceRefresh = false) => {
    // Check cache first (unless force refresh)
    if (!forceRefresh && typeof window !== 'undefined') {
      try {
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
      } catch (e) {
        console.log('Cache check failed, fetching from API')
      }
    }

    try {
      const supabase = createClient()
      
      // Create abort controller for timeout
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 10000)
      
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

      clearTimeout(timeoutId)

      if (error) {
        console.error('Error fetching climbs:', error)
        setLoading(false)
      } else {
        const climbsData = (data || []).map((climb: any) => ({
          ...climb,
          _fullLoaded: false
        })) as Climb[]
        console.log(`Loaded ${climbsData.length} climbs (basic data)${bounds ? ' for viewport' : ''}`)
        setClimbs(climbsData)
        setLoading(false)

        // Cache the data
        if (typeof window !== 'undefined') {
          localStorage.setItem(CACHE_KEY, JSON.stringify({
            data: climbsData,
            timestamp: Date.now()
          }))
        }
      }
    } catch (err) {
      console.error('Network error fetching climbs:', err)
      setLoading(false)
    }
    
    // Safety timeout - ensure loading is false after 15 seconds regardless
    setTimeout(() => {
      setLoading(false)
    }, 15000)
   }, [])

  // Set isClient to true after mount
  useEffect(() => {
    setIsClient(true)
  }, [])

  // Auto-detect location on mount
  useEffect(() => {
    if (!isClient) return

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
      },
      (error) => {
        console.error('Error getting location:', error)
        setLocationStatus('error')
      },
      { enableHighAccuracy: true, timeout: 15000 }
    )
  }, [isClient])

  // Load climbs on mount
  useEffect(() => {
    if (!isClient) return
    console.log('Initial load of climbs')
    loadClimbs()
  }, [isClient, loadClimbs])

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

  if (!isClient || loading) {
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
        maxZoom={19}
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

        <ClusterMapController
          climbs={climbs}
          visitedClimbs={visitedClimbs}
          onClimbClick={handleClimbClick}
          onHover={(id, pos) => {
            setHoveredClimb(id)
            setTooltipPosition(pos)
          }}
        />
      </MapContainer>

      {locationStatus === 'requesting' && (
        <div className="absolute top-4 right-20 z-[1000] bg-blue-50 border border-blue-300 rounded-lg px-3 py-2 text-sm text-blue-800">
          Requesting location permission...
        </div>
      )}

      {/* Hover tooltip */}
      {hoveredClimb && tooltipPosition && (() => {
        const climb = climbs.find(c => c.id === hoveredClimb)
        if (!climb) return null
        return (
          <div
            className="climb-tooltip visible"
            style={{
              left: tooltipPosition.x,
              top: tooltipPosition.y,
              transform: 'translate(-50%, -100%)'
            }}
          >
            {climb.image_url && (
              <div className="climb-tooltip-image">
                <img src={climb.image_url} alt={climb.name} />
              </div>
            )}
            <div className="climb-tooltip-content">
              <div className="climb-tooltip-name">{climb.name}</div>
              <div className="climb-tooltip-grade">Grade {climb.grade || '?'}</div>
            </div>
          </div>
        )
      })()}

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