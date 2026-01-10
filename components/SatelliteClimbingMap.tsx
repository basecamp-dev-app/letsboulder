'use client'

import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import dynamic from 'next/dynamic'
import { createClient } from '@/lib/supabase'
import Image from 'next/image'
import L from 'leaflet'
import { useSearchParams } from 'next/navigation'
import { MapPin, Loader2 } from 'lucide-react'
import { RoutePoint } from '@/lib/useRouteSelection'
import ImageModal from './ImageModal'

import 'leaflet/dist/leaflet.css'

delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
})

const MapContainer = dynamic(() => import('react-leaflet').then(mod => mod.MapContainer), { ssr: false })
const TileLayer = dynamic(() => import('react-leaflet').then(mod => mod.TileLayer), { ssr: false })
const Marker = dynamic(() => import('react-leaflet').then(mod => mod.Marker), { ssr: false })
const Tooltip = dynamic(() => import('react-leaflet').then(mod => mod.Tooltip), { ssr: false })

interface DefaultLocation {
  lat: number
  lng: number
  zoom: number
}

function DefaultLocationWatcher({ defaultLocation, mapRef }: { defaultLocation: DefaultLocation | null; mapRef: React.RefObject<L.Map | null> }) {
  useEffect(() => {
    if (defaultLocation && mapRef.current) {
      mapRef.current.setView([defaultLocation.lat, defaultLocation.lng], defaultLocation.zoom)
    }
  }, [defaultLocation, mapRef])
  return null
}

interface ImageRoute {
  id: string
  points: RoutePoint[]
  color: string
  climb: {
    id: string
    name: string | null
    grade: string | null
    description: string | null
  }
}

interface ImageData {
  id: string
  url: string
  latitude: number | null
  longitude: number | null
  route_lines: ImageRoute[]
}

export default function SatelliteClimbingMap() {
  const searchParams = useSearchParams()
  const mapRef = useRef<L.Map | null>(null)
  const [images, setImages] = useState<ImageData[]>([])
  const [loading, setLoading] = useState(true)
  const [isClient, setIsClient] = useState(false)
  const [selectedImage, setSelectedImage] = useState<ImageData | null>(null)
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null)
  const [debounceTimer, setDebounceTimer] = useState<NodeJS.Timeout | null>(null)
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null)
  const [locationStatus, setLocationStatus] = useState<'idle' | 'requesting' | 'tracking' | 'error'>('idle')
  const [mapLoaded, setMapLoaded] = useState(false)
  const [userLogs, setUserLogs] = useState<Record<string, string>>({})
  const [user, setUser] = useState<any>(null)
  const [toast, setToast] = useState<{id: string, status: string} | null>(null)
  const [defaultLocation, setDefaultLocation] = useState<{lat: number; lng: number; zoom: number} | null>(null)
  const [isAtDefaultLocation, setIsAtDefaultLocation] = useState(true)
  const [setLocationMode, setSetLocationMode] = useState(false)
  const [setLocationPending, setSetLocationPending] = useState<{lat: number; lng: number} | null>(null)
  const [isSavingLocation, setIsSavingLocation] = useState(false)

  const CACHE_KEY = 'gsyrocks_images_cache'
  const CACHE_DURATION = 24 * 60 * 60 * 1000

  const loadImages = useCallback(async (forceRefresh = false) => {
    if (!forceRefresh) {
      const cached = localStorage.getItem(CACHE_KEY)
      if (cached) {
        const { data, timestamp } = JSON.parse(cached)
        if (Date.now() - timestamp < CACHE_DURATION) {
          setImages(data)
          setLoading(false)
          return
        }
      }
    }

    try {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('images')
        .select(`
          id,
          url,
          latitude,
          longitude,
          route_lines!inner (
            id,
            points,
            color,
            climb!inner (
              id,
              name,
              grade,
              description,
              status
            )
          )
        `)
        .not('latitude', 'is', null)
        .eq('route_lines.climb.status', 'approved')

      if (error) {
        console.error('Error fetching images:', error)
      } else {
        const imagesData = (data || []).map((img: any) => ({
          id: img.id,
          url: img.url,
          latitude: img.latitude,
          longitude: img.longitude,
          route_lines: img.route_lines.map((rl: any) => ({
            id: rl.id,
            points: rl.points,
            color: rl.color,
            climb: rl.climb
          }))
        })) as ImageData[]
        setImages(imagesData)
        localStorage.setItem(CACHE_KEY, JSON.stringify({
          data: imagesData,
          timestamp: Date.now()
        }))
      }
    } catch (err) {
      console.error('Network error fetching images:', err)
    }
    setLoading(false)
  }, [])

  const handleLogClimb = async (climbId: string, status: string) => {
    if (!user) {
      window.location.href = `/auth?climbId=${climbId}`
      return
    }

    const supabase = createClient()
    setUserLogs(prev => ({ ...prev, [climbId]: status }))

    const { error } = await supabase
      .from('user_climbs')
      .upsert({
        user_id: user.id,
        climb_id: climbId,
        style: status,
        date_climbed: new Date().toISOString().split('T')[0]
      }, { onConflict: 'user_id,climb_id' })

    if (error) {
      setUserLogs(prev => {
        const next = { ...prev }
        delete next[climbId]
        return next
      })
    } else {
      setToast({ id: climbId, status })
      setTimeout(() => setToast(null), 2000)
    }
  }

  useEffect(() => {
    if (!isClient) return
    loadImages()
  }, [isClient, loadImages])

  useEffect(() => {
    if (!isClient) return

    if (!navigator.geolocation) return

    setLocationStatus('requesting')

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords
        setUserLocation([latitude, longitude])
        setLocationStatus('tracking')
        if (mapRef.current) {
          mapRef.current.setView([latitude, longitude], 12)
        }
      },
      () => setLocationStatus('error'),
      { enableHighAccuracy: true, timeout: 15000 }
    )
  }, [isClient])

  useEffect(() => {
    if (!isClient) return

    const fetchUserAndLogs = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      setUser(user)

      if (user) {
        const { data: logs } = await supabase
          .from('user_climbs')
          .select('climb_id, style')
          .eq('user_id', user.id)

        const logsMap: Record<string, string> = {}
        logs?.forEach(log => { logsMap[log.climb_id] = log.style })
        setUserLogs(logsMap)

        const { data: profile } = await supabase
          .from('profiles')
          .select('default_location_lat, default_location_lng, default_location_zoom')
          .eq('id', user.id)
          .single()

        if (profile?.default_location_lat) {
          setDefaultLocation({
            lat: profile.default_location_lat,
            lng: profile.default_location_lng,
            zoom: profile.default_location_zoom || 12
          })
        }
      }
    }
    fetchUserAndLogs()
  }, [isClient])

  useEffect(() => {
    if (!mapRef.current) return

    const map = mapRef.current
    const handleClick = (e: L.LeafletMouseEvent) => {
      if (!e.originalEvent.target || !(e.originalEvent.target as HTMLElement).closest('.image-marker')) {
        setSelectedImageId(null)
      }
      if (setLocationMode && mapRef.current) {
        const center = mapRef.current.getCenter()
        setSetLocationPending({ lat: center.lat, lng: center.lng })
      }
    }
    map.on('click', handleClick)
    return () => { map.off('click', handleClick) }
  }, [setLocationMode])

  useEffect(() => {
    if (!mapRef.current || !defaultLocation) return
    const map = mapRef.current
    const handleMoveEnd = () => {
      const center = map.getCenter()
      const distance = Math.sqrt(
        Math.pow(center.lat - defaultLocation.lat, 2) + 
        Math.pow(center.lng - defaultLocation.lng, 2)
      )
      setIsAtDefaultLocation(distance < 0.01)
    }
    map.on('moveend', handleMoveEnd)
    return () => { map.off('moveend', handleMoveEnd) }
  }, [defaultLocation])

  useEffect(() => {
    setIsClient(true)
  }, [])

  const skeletonPins = useMemo(() => {
    if (images.length > 0) return []
    const regions = [
      { lat: 49.45, lng: -2.6, name: 'Guernsey' },
      { lat: 51.5, lng: -0.12, name: 'London' },
      { lat: 40.7, lng: -74.0, name: 'New York' },
      { lat: 34.0, lng: -118.2, name: 'Los Angeles' },
      { lat: 48.8, lng: 2.3, name: 'Paris' },
    ]
    return regions.map((region, i) => ({
      id: `skeleton-${i}`,
      latitude: region.lat + (Math.random() - 0.5) * 0.5,
      longitude: region.lng + (Math.random() - 0.5) * 0.5
    }))
  }, [images.length])

  if (!isClient) {
    return <div className="h-screen w-full bg-gray-900" />
  }

  return (
    <div className="h-screen w-full relative">
      <MapContainer
        ref={mapRef as any}
        center={[20, 0]}
        zoom={2}
        style={{ height: '100%', width: '100%' }}
        zoomControl={false}
        scrollWheelZoom={true}
        whenReady={() => {
          setMapLoaded(true)
          setTimeout(() => {
            if (defaultLocation && mapRef.current) {
              mapRef.current.setView([defaultLocation.lat, defaultLocation.lng], defaultLocation.zoom)
            }
          }, 100)
        }}
      >
        <DefaultLocationWatcher defaultLocation={defaultLocation} mapRef={mapRef} />
        <TileLayer
          url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
          attribution='Tiles © Esri'
          maxZoom={19}
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

        {(!mapLoaded || loading) && skeletonPins.map((pin: any) => (
          <Marker
            key={pin.id}
            position={[pin.latitude, pin.longitude]}
            icon={L.divIcon({
              className: 'image-marker skeleton',
              iconSize: [12, 12],
              iconAnchor: [6, 6]
            })}
          />
        ))}

        {mapLoaded && !loading && images.map(image => (
          <Marker
            key={image.id}
            position={[image.latitude || 0, image.longitude || 0]}
            icon={L.divIcon({
              className: 'image-marker',
              html: `<div style="
                background: #ef4444;
                width: 24px;
                height: 24px;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                color: white;
                font-size: 11px;
                font-weight: bold;
                border: 2px solid white;
                box-shadow: 0 2px 4px rgba(0,0,0,0.3);
              ">${image.route_lines.length}</div>`,
              iconSize: [24, 24],
              iconAnchor: [12, 12]
            })}
            eventHandlers={{
              click: (e: L.LeafletMouseEvent) => {
                e.originalEvent.stopPropagation()
                if (selectedImageId !== image.id) {
                  setSelectedImageId(image.id)
                }
              },
            }}
          >
            {selectedImageId === image.id && (
              <Tooltip
                direction="top"
                offset={[0, -30]}
                opacity={1}
                permanent={true}
                interactive={true}
                eventHandlers={{
                  click: () => {
                    setSelectedImage(image)
                    setSelectedImageId(null)
                    if (mapRef.current && image.latitude && image.longitude) {
                      mapRef.current.setView([image.latitude, image.longitude], Math.min(mapRef.current.getZoom() + 2, 18))
                    }
                  }
                }}
              >
                <div className="w-40 cursor-pointer">
                  <div className="relative h-24 w-full mb-2 rounded overflow-hidden">
                    <Image
                      src={image.url}
                      alt="Routes"
                      fill
                      className="object-cover"
                      sizes="160px"
                    />
                  </div>
                  <p className="font-semibold text-sm text-gray-900">
                    {image.route_lines.length} route{image.route_lines.length !== 1 ? 's' : ''}
                  </p>
                </div>
              </Tooltip>
            )}
          </Marker>
        ))}
      </MapContainer>

      {(!mapLoaded || loading) && (
        <div className="absolute top-4 left-4 z-[1000] bg-white bg-opacity-90 rounded-lg px-3 py-2 text-sm text-gray-700 shadow-md">
          Loading routes...
        </div>
      )}

      {locationStatus === 'requesting' && (
        <div className="absolute top-4 right-20 z-[1000] bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm">
          Requesting location...
        </div>
      )}

      {defaultLocation && !isAtDefaultLocation && (
        <button
          onClick={() => {
            if (mapRef.current) {
              mapRef.current.setView([defaultLocation.lat, defaultLocation.lng], defaultLocation.zoom)
              setIsAtDefaultLocation(true)
            }
          }}
          className="absolute bottom-24 left-4 z-[1000] bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm shadow-md flex items-center gap-2"
        >
          <MapPin className="w-4 h-4" />
          Go to Default Location
        </button>
      )}

      {setLocationMode && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000] bg-blue-600 text-white rounded-lg px-4 py-2 text-sm shadow-lg">
          Click on the map to set your default location
        </div>
      )}

      {setLocationPending && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-[1001] bg-white dark:bg-gray-800 rounded-lg p-4 shadow-xl max-w-xs">
          <p className="text-sm mb-3">Set default location here?</p>
          <div className="flex gap-2">
            <button
              onClick={() => { setSetLocationPending(null); setSetLocationMode(false) }}
              className="flex-1 px-3 py-1.5 text-sm border rounded hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              Cancel
            </button>
            <button
              onClick={async () => {
                if (!setLocationPending || !user) return
                setIsSavingLocation(true)
                try {
                  const response = await fetch(`/api/locations/reverse?lat=${setLocationPending.lat}&lng=${setLocationPending.lng}`)
                  const data = await response.json()
                  await fetch('/api/settings', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      defaultLocationName: data.display_name || 'Custom Location',
                      defaultLocationLat: setLocationPending.lat,
                      defaultLocationLng: setLocationPending.lng,
                      defaultLocationZoom: mapRef.current?.getZoom() || 12,
                    }),
                  })
                  setDefaultLocation({ lat: setLocationPending.lat, lng: setLocationPending.lng, zoom: mapRef.current?.getZoom() || 12 })
                  setSetLocationPending(null)
                  setSetLocationMode(false)
                  setIsAtDefaultLocation(true)
                } catch {
                  alert('Failed to save location')
                } finally {
                  setIsSavingLocation(false)
                }
              }}
              disabled={isSavingLocation}
              className="flex-1 px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {isSavingLocation ? <Loader2 className="w-4 h-4 inline animate-spin mr-1" /> : null}
              {isSavingLocation ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      )}

      <ImageModal
        image={selectedImage}
        onClose={() => setSelectedImage(null)}
        userLogs={userLogs}
        onLogClimb={handleLogClimb}
      />

      {toast && (
        <div className="absolute bottom-52 left-1/2 -translate-x-1/2 z-[1003]">
          <div className="bg-green-600 text-white px-4 py-2 rounded-lg shadow-lg text-sm font-medium">
            ✓ Climb logged to your logbook
          </div>
        </div>
      )}
    </div>
  )
}
