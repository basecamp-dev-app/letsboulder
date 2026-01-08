'use client'

import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import dynamic from 'next/dynamic'
import { createClient } from '@/lib/supabase'
import Image from 'next/image'
import L from 'leaflet'
import { useSearchParams } from 'next/navigation'
import { Share2, MapPin, Loader2 } from 'lucide-react'
import { catmullRomSpline, RoutePoint } from '@/lib/useRouteSelection'

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

interface DefaultLocation {
  lat: number
  lng: number
  zoom: number
}

// Component to watch for default location changes and center the map
function DefaultLocationWatcher({ defaultLocation, mapRef }: { defaultLocation: DefaultLocation | null; mapRef: React.RefObject<L.Map | null> }) {
  useEffect(() => {
    if (defaultLocation && mapRef.current) {
      console.log('DefaultLocationWatcher: Centering map on:', defaultLocation)
      mapRef.current.setView([defaultLocation.lat, defaultLocation.lng], defaultLocation.zoom)
    }
  }, [defaultLocation, mapRef])

  return null
}


interface Climb {
  id: string
  name?: string
  grade?: string
  image_url?: string
  description?: string
  coordinates?: RoutePoint[] | string
  crags: { name: string; latitude: number; longitude: number }
  _fullLoaded?: boolean
}

export default function SatelliteClimbingMap() {
  const searchParams = useSearchParams()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const modalCanvasRef = useRef<HTMLCanvasElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const [climbs, setClimbs] = useState<Climb[]>([])
  const [loading, setLoading] = useState(true)
  const [isClient, setIsClient] = useState(true)
  const [selectedClimb, setSelectedClimb] = useState<Climb | null>(null)
  const [selectedClimbId, setSelectedClimbId] = useState<string | null>(null)
  const [imageError, setImageError] = useState(false)
  const [debounceTimer, setDebounceTimer] = useState<NodeJS.Timeout | null>(null)
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null)
  const [locationStatus, setLocationStatus] = useState<'idle' | 'requesting' | 'tracking' | 'error'>('idle')
  const [mapReady, setMapReady] = useState(true)
  const [userLogs, setUserLogs] = useState<Record<string, string>>({})
  const [user, setUser] = useState<any>(null)
  const [toast, setToast] = useState<{id: string, status: string} | null>(null)
  const [selectedRouteIds, setSelectedRouteIds] = useState<string[]>([])
  const [routeCoordinates, setRouteCoordinates] = useState<Record<string, RoutePoint[]>>({})
  const [modalImageLoaded, setModalImageLoaded] = useState(false)
  const [defaultLocation, setDefaultLocation] = useState<{lat: number; lng: number; zoom: number} | null>(null)
  const [isAtDefaultLocation, setIsAtDefaultLocation] = useState(true)
  const [setLocationMode, setSetLocationMode] = useState(false)
  const [setLocationPending, setSetLocationPending] = useState<{lat: number; lng: number} | null>(null)
  const [isSavingLocation, setIsSavingLocation] = useState(false)

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
          id, name, grade, image_url, description, coordinates
        `)
        .eq('id', climbId)
        .single()

      if (error) {
        console.error('Supabase error fetching climb details:', error)
        return { id: climbId, grade: '', image_url: undefined, description: undefined, coordinates: undefined }
      }

      const climbData = data as { id: string; name?: string; grade?: string; image_url?: string; description?: string; coordinates?: RoutePoint[] | string }
      
      let parsedCoordinates: RoutePoint[] | undefined
      if (climbData.coordinates) {
        if (typeof climbData.coordinates === 'string') {
          try {
            parsedCoordinates = JSON.parse(climbData.coordinates)
          } catch {
            parsedCoordinates = undefined
          }
        } else {
          parsedCoordinates = climbData.coordinates
        }
      }

      return { 
        id: climbData.id, 
        name: climbData.name,
        grade: climbData.grade, 
        image_url: climbData.image_url, 
        description: climbData.description,
        coordinates: parsedCoordinates
      }
    } catch (err) {
      console.error('Network error loading climb details:', err)
      return { id: climbId, image_url: undefined, description: undefined, coordinates: undefined }
    }
  }, [])

  // Handle logging a climb (Flash, Top, Try)
  const handleLogClimb = async (climbId: string, status: string) => {
    if (!user) {
      window.location.href = `/auth?climbId=${climbId}`
      return
    }

    const supabase = createClient()

    // Optimistic update
    setUserLogs(prev => ({ ...prev, [climbId]: status }))

    const { error } = await supabase
      .from('logs')
      .upsert({
        user_id: user.id,
        climb_id: climbId,
        status,
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id,climb_id' })

    if (error) {
      // Revert on error
      setUserLogs(prev => {
        const next = { ...prev }
        delete next[climbId]
        return next
      })
      console.error('Failed to log climb:', error)
    } else {
      // Show success toast
      setToast({ id: climbId, status })
      setTimeout(() => setToast(null), 2000)
    }
  }

  // Handle share functionality
  const handleShare = async () => {
    if (!selectedClimb) return

    const shareUrl = typeof window !== 'undefined' ? window.location.origin + `/climb/${selectedClimb.id}` : ''
    const shareText = selectedClimb.name 
      ? `Check out "${selectedClimb.name}"${selectedClimb.grade ? ` (${selectedClimb.grade})` : ''}!`
      : 'Check out this climb!'

    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: selectedClimb.name || 'Climb',
          text: shareText,
          url: shareUrl
        })
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          await navigator.clipboard.writeText(shareUrl)
          alert('Link copied to clipboard!')
        }
      }
    } else {
      await navigator.clipboard.writeText(shareUrl)
      alert('Link copied to clipboard!')
    }
  }

  // Draw route on canvas
  const drawRoute = useCallback((ctx: CanvasRenderingContext2D, points: RoutePoint[], color: string, width: number, isLogged: boolean) => {
    if (points.length < 2) return

    ctx.strokeStyle = color
    ctx.lineWidth = width
    ctx.setLineDash(isLogged ? [] : [8, 4])

    const smoothedPoints = catmullRomSpline(points, 0.5, 20)

    ctx.beginPath()
    ctx.moveTo(smoothedPoints[0].x, smoothedPoints[0].y)

    for (let i = 1; i < smoothedPoints.length; i++) {
      ctx.lineTo(smoothedPoints[i].x, smoothedPoints[i].y)
    }

    ctx.stroke()
    ctx.setLineDash([])

    if (points.length > 0) {
      ctx.fillStyle = color
      const lastPoint = points[points.length - 1]
      ctx.beginPath()
      ctx.arc(lastPoint.x, lastPoint.y, 6, 0, 2 * Math.PI)
      ctx.fill()
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
          id, name, grade, image_url,
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

  const [mapLoaded, setMapLoaded] = useState(false)

  // Fetch user, their logs, and default location
  useEffect(() => {
    const fetchUserAndLogs = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      setUser(user)

      if (user) {
        const { data: logs } = await supabase
          .from('logs')
          .select('climb_id, status')
          .eq('user_id', user.id)

        const logsMap: Record<string, string> = {}
        logs?.forEach(log => { logsMap[log.climb_id] = log.status })
        setUserLogs(logsMap)

        // Fetch user's default location
        const { data: profile } = await supabase
          .from('profiles')
          .select('default_location_lat, default_location_lng, default_location_zoom, default_location_name')
          .eq('id', user.id)
          .single()

        console.log('Fetched profile:', profile)

        if (profile?.default_location_lat && profile?.default_location_lng) {
          const location = {
            lat: profile.default_location_lat,
            lng: profile.default_location_lng,
            zoom: profile.default_location_zoom || 12
          }
          console.log('Setting default location:', location)
          setDefaultLocation(location)
          
          // Check if we should center on default location
          const setLocationFromParams = searchParams.get('setLocation')
          if (setLocationFromParams === 'true') {
            setSetLocationMode(true)
          } else {
            // Center on default location with retry
            const centerOnLocation = () => {
              if (mapRef.current) {
                console.log('Centering map on default location:', location)
                mapRef.current.setView([location.lat, location.lng], location.zoom)
                setIsAtDefaultLocation(true)
              } else {
                // Retry in 100ms if map not ready
                setTimeout(centerOnLocation, 100)
              }
            }
            setTimeout(centerOnLocation, 500)
          }
        } else if (searchParams.get('setLocation') === 'true') {
          setSetLocationMode(true)
        }
      } else if (searchParams.get('setLocation') === 'true') {
        setSetLocationMode(true)
      }
    }
    fetchUserAndLogs()
  }, [searchParams])

  // Close tooltip when clicking on map
  useEffect(() => {
    if (mapRef.current) {
      const map = mapRef.current
      const handleMapClick = (e: L.LeafletMouseEvent) => {
        // Only close if clicking on the map background, not on markers
        if (!e.originalEvent.target || !(e.originalEvent.target as HTMLElement).closest('.climb-marker')) {
          setSelectedClimbId(null)
        }
        
        // Handle set location mode
        if (setLocationMode && mapRef.current) {
          const center = mapRef.current.getCenter()
          setSetLocationPending({ lat: center.lat, lng: center.lng })
        }
      }
      map.on('click', handleMapClick)
      return () => {
        map.off('click', handleMapClick)
      }
    }
  }, [mapLoaded, setLocationMode])

  // Track when map is at default location
  useEffect(() => {
    if (!mapRef.current || !defaultLocation) return

    const map = mapRef.current
    const handleMoveEnd = () => {
      const center = map.getCenter()
      const distance = Math.sqrt(
        Math.pow(center.lat - defaultLocation.lat, 2) + 
        Math.pow(center.lng - defaultLocation.lng, 2)
      )
      // Consider "at default" if within ~0.01 degrees (roughly 1km)
      setIsAtDefaultLocation(distance < 0.01)
    }

    map.on('moveend', handleMoveEnd)
    return () => {
      map.off('moveend', handleMoveEnd)
    }
  }, [defaultLocation])

  // Auto-open climb modal when climbId is in URL
  useEffect(() => {
    const climbId = searchParams.get('climbId')
    if (climbId && mapLoaded && !selectedClimb) {
      loadClimbDetails(climbId).then(details => {
        if (details) {
          setSelectedClimb(details as Climb)
        }
      })
    }
  }, [searchParams, mapLoaded, selectedClimb, loadClimbDetails])

  // Draw routes on modal canvas when image loads and climb changes
  useEffect(() => {
    if (!modalImageLoaded || !selectedClimb?.coordinates || !modalCanvasRef.current) return

    const canvas = modalCanvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const image = imageRef.current
    if (!image) return

    const container = canvas.parentElement
    if (!container) return

    const containerRect = container.getBoundingClientRect()
    const imageAspect = image.naturalWidth / image.naturalHeight
    const containerAspect = containerRect.width / containerRect.height

    let displayWidth, displayHeight, offsetX = 0, offsetY = 0
    if (imageAspect > containerAspect) {
      displayWidth = containerRect.width
      displayHeight = containerRect.width / imageAspect
      offsetY = (containerRect.height - displayHeight) / 2
    } else {
      displayHeight = containerRect.height
      displayWidth = containerRect.height * imageAspect
      offsetX = (containerRect.width - displayWidth) / 2
    }

    canvas.style.left = `${offsetX}px`
    canvas.style.top = `${offsetY}px`
    canvas.width = displayWidth
    canvas.height = displayHeight

    ctx.clearRect(0, 0, canvas.width, canvas.height)

    const isLogged = !!userLogs[selectedClimb.id]
    const coordinates = selectedClimb.coordinates as RoutePoint[]

    if (coordinates && coordinates.length >= 2) {
      drawRoute(ctx, coordinates, isLogged ? '#22c55e' : '#ef4444', 3, isLogged)
    }
  }, [modalImageLoaded, selectedClimb, userLogs, drawRoute])

  // Default world center - will be updated to user location if available
  const worldCenter: [number, number] = [20, 0]
  const zoom = 2

  // Generate placeholder pins distributed globally for loading state
  const skeletonPins = useMemo(() => {
    if (climbs.length > 0) return []
    // Generate placeholder pins distributed around major climbing regions
    const regions = [
      { lat: 49.45, lng: -2.6, name: 'Guernsey' },
      { lat: 51.5, lng: -0.12, name: 'London' },
      { lat: 40.7, lng: -74.0, name: 'New York' },
      { lat: 34.0, lng: -118.2, name: 'Los Angeles' },
      { lat: 48.8, lng: 2.3, name: 'Paris' },
      { lat: 52.5, lng: 13.4, name: 'Berlin' },
      { lat: -33.8, lng: 151.2, name: 'Sydney' },
      { lat: -23.5, lng: -46.6, name: 'São Paulo' },
    ]
    return regions.map((region, i) => ({
      id: `skeleton-${i}`,
      crags: {
        name: region.name,
        latitude: region.lat + (Math.random() - 0.5) * 0.5,
        longitude: region.lng + (Math.random() - 0.5) * 0.5
      }
    }))
  }, [climbs.length])

  // Don't render Leaflet components until client-side
  if (!isClient) {
    return (
      <div className="h-screen w-full bg-gray-900" />
    )
  }

  return (
    <div className="h-screen w-full relative">
      <MapContainer
        ref={mapRef as any}
        center={worldCenter}
        zoom={zoom}
        style={{ height: '100%', width: '100%' }}
        zoomControl={false}
        scrollWheelZoom={true}
        whenReady={() => {
          setMapLoaded(true)
          // Store map reference using a small delay to ensure it's ready
          setTimeout(() => {
            console.log('Map ready, defaultLocation:', defaultLocation)
            
            // Center on default location if set
            if (defaultLocation && mapRef.current) {
              console.log('Centering on default location:', defaultLocation)
              mapRef.current.setView([defaultLocation.lat, defaultLocation.lng], defaultLocation.zoom)
            } else if (mapRef.current) {
              // Check URL params for location
              const lat = searchParams.get('lat')
              const lng = searchParams.get('lng')
              const zoomParam = searchParams.get('zoom')
              if (lat && lng) {
                const parsedLat = parseFloat(lat)
                const parsedLng = parseFloat(lng)
                const parsedZoom = zoomParam ? parseInt(zoomParam) : 15
                if (!isNaN(parsedLat) && !isNaN(parsedLng)) {
                  mapRef.current.setView([parsedLat, parsedLng], parsedZoom)
                }
              }
            }
          }, 100)
        }}
      >
        <DefaultLocationWatcher defaultLocation={defaultLocation} mapRef={mapRef} />
        <TileLayer
          url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
          attribution='Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics and others'
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

        {/* Skeleton pins while map/data loading */}
        {(!mapLoaded || loading) && skeletonPins.map((climb: any) => (
          <Marker
            key={climb.id}
            position={[climb.crags.latitude, climb.crags.longitude]}
            icon={L.divIcon({
              className: 'climb-marker skeleton',
              iconSize: [12, 12],
              iconAnchor: [6, 6]
            })}
          />
        ))}

        {/* Real pins when map and data are loaded */}
        {mapLoaded && !loading && climbs.map(climb => (
          <Marker
            key={climb.id}
            position={[climb.crags.latitude, climb.crags.longitude]}
            icon={L.divIcon({
              className: 'climb-marker',
              iconSize: [12, 12],
              iconAnchor: [6, 6]
            })}
            eventHandlers={{
              click: async (e: L.LeafletMouseEvent) => {
                e.originalEvent.stopPropagation();

                // First click always shows tooltip
                if (selectedClimbId !== climb.id) {
                  console.log('Showing tooltip for:', climb.name);
                  setSelectedClimbId(climb.id);
                  if (!climb._fullLoaded) {
                    const details = await loadClimbDetails(climb.id);
                    if (details) {
                      const fullClimb = { ...climb, ...details, _fullLoaded: true };
                      setClimbs(prev => prev.map(c => c.id === climb.id ? fullClimb : c));
                    }
                  }
                }
              },
            }}
          >
            {selectedClimbId === climb.id && (
              <Tooltip
                direction="top"
                offset={[0, -25]}
                opacity={1}
                permanent={true}
                interactive={true}
                eventHandlers={{
                  click: async () => {
                    console.log('Tooltip clicked - opening full image for:', climb.name);
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
                    setSelectedClimbId(null);
                    if (mapRef.current) {
                      mapRef.current.setView([climb.crags.latitude, climb.crags.longitude], Math.min(mapRef.current.getZoom() + 4, 18))
                    }
                  }
                }}
              >
                <div className="w-40 cursor-pointer">
                  {climb.image_url ? (
                    <div className="relative h-24 w-full mb-2 rounded overflow-hidden">
                      <Image
                        src={climb.image_url}
                        alt={climb.name || 'Climb'}
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
            )}
          </Marker>
        ))}
      </MapContainer>

      {(!mapLoaded || loading) && (
        <div className="absolute top-4 left-4 z-[1000] bg-white bg-opacity-90 rounded-lg px-3 py-2 text-sm text-gray-700 shadow-md">
          Loading routes…
        </div>
      )}

      {locationStatus === 'requesting' && (
        <div className="absolute top-4 right-20 z-[1000] bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-800 dark:text-gray-200">
          Requesting location permission...
        </div>
      )}

      {/* Go to Default Location button */}
      {defaultLocation && !isAtDefaultLocation && (
        <button
          onClick={() => {
            if (mapRef.current) {
              mapRef.current.setView([defaultLocation.lat, defaultLocation.lng], defaultLocation.zoom)
              setIsAtDefaultLocation(true)
            }
          }}
          className="absolute bottom-24 left-4 z-[1000] bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-800 dark:text-gray-200 shadow-md hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2"
        >
          <MapPin className="w-4 h-4" />
          Go to Default Location
        </button>
      )}

      {/* Set Location Mode banner */}
      {setLocationMode && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000] bg-blue-600 text-white rounded-lg px-4 py-2 text-sm shadow-lg">
          Click on the map to set your default location
        </div>
      )}

      {/* Set Location confirmation */}
      {setLocationPending && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-[1001] bg-white dark:bg-gray-800 rounded-lg p-4 shadow-xl max-w-xs">
          <p className="text-sm text-gray-900 dark:text-gray-100 mb-3">
            Set default location here?
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => {
                setSetLocationPending(null)
                setSetLocationMode(false)
                window.close()
              }}
              className="flex-1 px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              Cancel
            </button>
            <button
              onClick={async () => {
                if (!setLocationPending || !user) return

                setIsSavingLocation(true)
                try {
                  const response = await fetch(
                    `/api/locations/reverse?lat=${setLocationPending.lat}&lng=${setLocationPending.lng}`
                  )
                  const data = await response.json()

                  const saveResponse = await fetch('/api/settings', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      defaultLocationName: data.display_name || 'Custom Location',
                      defaultLocationLat: setLocationPending.lat,
                      defaultLocationLng: setLocationPending.lng,
                      defaultLocationZoom: mapRef.current?.getZoom() || 12,
                    }),
                  })

                  if (!saveResponse.ok) {
                    throw new Error('Failed to save location')
                  }

                  setDefaultLocation({
                    lat: setLocationPending.lat,
                    lng: setLocationPending.lng,
                    zoom: mapRef.current?.getZoom() || 12
                  })
                  setSetLocationPending(null)
                  setSetLocationMode(false)
                  setIsAtDefaultLocation(true)
                  
                  if (window.opener) {
                    window.close()
                  }
                } catch (error) {
                  console.error('Error saving location:', error)
                  alert('Failed to save location. Please try again.')
                } finally {
                  setIsSavingLocation(false)
                }
              }}
              disabled={isSavingLocation}
              className="flex-1 px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {isSavingLocation ? (
                <>
                  <Loader2 className="w-4 h-4 inline animate-spin mr-1" />
                  Saving...
                </>
              ) : (
                'Save'
              )}
            </button>
          </div>
        </div>
      )}

      {/* Save default location handler */}
      {setLocationPending && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-[1001] bg-white dark:bg-gray-800 rounded-lg p-4 shadow-xl max-w-xs">
          <p className="text-sm text-gray-900 dark:text-gray-100 mb-3">
            Set default location here?
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => {
                setSetLocationPending(null)
                setSetLocationMode(false)
                if (window.opener) {
                  window.close()
                }
              }}
              className="flex-1 px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              Cancel
            </button>
            <button
              onClick={async () => {
                if (!setLocationPending || !user) return

                setIsSavingLocation(true)
                try {
                  // Reverse geocode the location
                  const response = await fetch(
                    `/api/locations/reverse?lat=${setLocationPending.lat}&lng=${setLocationPending.lng}`
                  )
                  const data = await response.json()

                  const saveResponse = await fetch('/api/settings', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      defaultLocationName: data.display_name || 'Custom Location',
                      defaultLocationLat: setLocationPending.lat,
                      defaultLocationLng: setLocationPending.lng,
                      defaultLocationZoom: mapRef.current?.getZoom() || 12,
                    }),
                  })

                  if (!saveResponse.ok) {
                    throw new Error('Failed to save location')
                  }

                  setDefaultLocation({
                    lat: setLocationPending.lat,
                    lng: setLocationPending.lng,
                    zoom: mapRef.current?.getZoom() || 12
                  })
                  setSetLocationPending(null)
                  setSetLocationMode(false)
                  setIsAtDefaultLocation(true)
                  
                  // Close the popup window if it was opened from settings
                  if (window.opener) {
                    window.close()
                  }
                } catch (error) {
                  console.error('Error saving location:', error)
                  alert('Failed to save location. Please try again.')
                } finally {
                  setIsSavingLocation(false)
                }
              }}
              disabled={isSavingLocation}
              className="flex-1 px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {isSavingLocation ? (
                <>
                  <Loader2 className="w-4 h-4 inline animate-spin mr-1" />
                  Saving...
                </>
              ) : (
                'Save'
              )}
            </button>
          </div>
        </div>
      )}

        {selectedClimb && (
        <>
          <div
            className="fixed inset-0 bg-black bg-opacity-75 z-[1000] md:inset-0"
            onClick={() => {
              setSelectedClimb(null)
            }}
          ></div>

          <div className="fixed inset-0 z-[1001] pointer-events-none pt-12">
            {selectedClimb.image_url ? (
              <div className="absolute top-16 bottom-16 left-0 right-0 pointer-events-auto md:top-16 md:bottom-20">
                <div className="relative w-full h-full">
                  <Image
                    ref={imageRef}
                    src={selectedClimb.image_url}
                    alt={selectedClimb.name || 'Climb'}
                    fill
                    className="object-contain"
                    sizes="100vw"
                    onLoadingComplete={() => {
                      console.log('Image loaded successfully:', selectedClimb.image_url)
                      setModalImageLoaded(true)
                    }}
                    onError={() => {
                      console.log('Image failed to load:', selectedClimb.image_url);
                      setImageError(true);
                    }}
                    priority
                  />
                  <canvas
                    ref={modalCanvasRef}
                    className="absolute inset-0 w-full h-full pointer-events-auto"
                    style={{ touchAction: 'none' }}
                  />
                </div>
              </div>
            ) : (
              <div className="absolute top-16 bottom-16 left-0 right-0 bg-gray-200 flex items-center justify-center pointer-events-auto md:top-16 md:bottom-20">
                <div className="text-gray-600">
                  {selectedClimb._fullLoaded === false ? 'Loading image...' : 'No image available'}
                </div>
              </div>
            )}
  
            {/* Draw routes on canvas when image loads */}
            {selectedClimb.coordinates && modalImageLoaded && (
              <canvas
                ref={modalCanvasRef}
                className="absolute top-16 bottom-16 left-0 right-0 pointer-events-auto md:top-16 md:bottom-20"
                style={{ touchAction: 'none' }}
              />
            )}

            {toast?.id === selectedClimb.id && (
              <div className="absolute bottom-52 left-1/2 -translate-x-1/2 z-[1003]">
                <div className="bg-green-600 text-white px-4 py-2 rounded-lg shadow-lg text-sm font-medium animate-fade-in-out">
                  ✓ Climb logged to your logbook
                </div>
              </div>
            )}

              <div className="absolute bottom-16 md:bottom-0 left-0 right-0 bg-white dark:bg-gray-900 p-4 pointer-events-auto max-h-[40vh] overflow-y-auto">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-black dark:text-white text-lg font-semibold">{selectedClimb.name || 'Unnamed Climb'}, {selectedClimb.grade}</p>
                    {selectedClimb.coordinates && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        {selectedRouteIds.length > 0 
                          ? `${selectedRouteIds.length} route${selectedRouteIds.length > 1 ? 's' : ''} selected`
                          : 'Routes available - click to select'}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={handleShare}
                    className="p-2 text-gray-500 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                    aria-label="Share climb"
                  >
                    <Share2 className="w-5 h-5" />
                  </button>
                </div>
                
                {/* Log checkboxes */}
                <div className="flex gap-4 mt-3">
                  {['flash', 'top', 'try'].map(status => (
                    <label key={status} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name={`log-${selectedClimb.id}`}
                        checked={userLogs[selectedClimb.id] === status}
                        onChange={() => handleLogClimb(selectedClimb.id, status)}
                        className="w-4 h-4"
                      />
                      <span className="text-sm capitalize text-gray-700 dark:text-gray-300">{status}</span>
                    </label>
                  ))}
                </div>
                
                {selectedClimb.description && (
                  <p className="text-gray-700 dark:text-gray-300 text-sm mt-2">{selectedClimb.description}</p>
                )}
                {imageError && selectedClimb.image_url && (
                  <p className="text-gray-500 dark:text-gray-400 text-xs mt-1">
                    Image failed to load
                  </p>
                )}
              </div>
            <button 
              onClick={() => setSelectedClimb(null)} 
              className="absolute top-16 right-4 text-white bg-black bg-opacity-50 rounded-full p-2 z-[1002] pointer-events-auto md:top-4"
            >
              X
            </button>
          </div>
        </>
      )}
    </div>
  )
}