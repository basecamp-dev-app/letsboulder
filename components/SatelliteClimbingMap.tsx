'use client'

import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import dynamic from 'next/dynamic'
import { createClient } from '@/lib/supabase'
import L from 'leaflet'
import { MapPin, Loader2, RefreshCw } from 'lucide-react'
import { RoutePoint } from '@/lib/useRouteSelection'
import { geoJsonPolygonToLeaflet, type GeoJSONPolygon } from '@/lib/geo-utils'
import type { User } from '@supabase/supabase-js'

import 'leaflet/dist/leaflet.css'
import { trackEvent, trackRouteClicked } from '@/lib/posthog'

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
const Polygon = dynamic(() => import('react-leaflet').then(mod => mod.Polygon), { ssr: false })

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
  } | null
}

interface ImageData {
  id: string
  url: string
  latitude: number | null
  longitude: number | null
  route_lines: ImageRoute[]
  is_verified: boolean
  verification_count: number
}

interface CragData {
  id: string
  name: string
  latitude: number
  longitude: number
  boundary: {
    type: 'Polygon'
    coordinates: number[][][]
  } | null
}

interface CragPin {
  id: string
  name: string
  latitude: number
  longitude: number
  imageCount: number
}

interface RouteLineData {
  id: string
  image_id: string
  points: unknown
  color: string
  climb_id: string
  climbs: {
    id: string
    name: string | null
    grade: string | null
    description: string | null
    status: string | null
  }[] | null
}

export default function SatelliteClimbingMap() {
  const mapRef = useRef<L.Map | null>(null)
  const [images, setImages] = useState<ImageData[]>([])
  const [crags, setCrags] = useState<CragData[]>([])
  const [loading, setLoading] = useState(true)
  const [isClient, setIsClient] = useState(false)
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null)
  const [locationStatus, setLocationStatus] = useState<'idle' | 'requesting' | 'tracking' | 'error'>('idle')
  const [mapLoaded, setMapLoaded] = useState(false)
  const [user, setUser] = useState<User | null>(null)
  const [defaultLocation, setDefaultLocation] = useState<{lat: number; lng: number; zoom: number} | null>(null)
  const [isAtDefaultLocation, setIsAtDefaultLocation] = useState(true)
  const [useUserLocation, setUseUserLocation] = useState(false)
  const [cragPins, setCragPins] = useState<CragPin[]>([])

  const CACHE_KEY = 'gsyrocks_images_cache'

  const loadImages = useCallback(async () => {
    if (!isClient) {
      setLoading(false)
      return
    }

    const cacheKey = CACHE_KEY + '_v3' // New cache key to force refresh
    
    // Always fetch fresh data
    localStorage.removeItem(cacheKey)

    try {
      const supabase = createClient()
      
      // First get all images with latitude
      const { data: imagesData, error: imagesError } = await supabase
        .from('images')
        .select('id, url, latitude, longitude, is_verified, verification_count, crag_id')
        .not('latitude', 'is', null)
        .not('crag_id', 'is', null)
        .order('created_at', { ascending: false })

      if (imagesError) {
        setImages([])
        setLoading(false)
        return
      }

      if (!imagesData || imagesData.length === 0) {
        setImages([])
        setLoading(false)
        return
      }

      // Get route_lines for each image separately
      const imageIds = imagesData.map(img => img.id)
      
      const { data: routeLinesData, error: rlError } = await supabase
        .from('route_lines')
        .select(`
          id,
          image_id,
          points,
          color,
          climb_id,
          climbs (
            id,
            name,
            grade,
            description,
            status
          )
        `)
        .in('image_id', imageIds)

      if (rlError) {
        setImages([])
        setLoading(false)
        return
      }

      if (!routeLinesData || routeLinesData.length === 0) {
        setImages([])
        setLoading(false)
        return
      }

      // Build a map of image_id -> route_lines
      const routeLinesMap = new Map<string, RouteLineData[]>()
      for (const rl of routeLinesData) {
        const existing = routeLinesMap.get(rl.image_id) || []
        existing.push(rl)
        routeLinesMap.set(rl.image_id, existing)
      }

      // Get unique climb IDs for verification lookup
      const allClimbIds = [...new Set(routeLinesData.map(rl => rl.climb_id).filter(Boolean))]

      // Fetch verification counts for all climbs
      const { data: verificationCounts } = await supabase
        .from('climb_verifications')
        .select('climb_id')
        .in('climb_id', allClimbIds)

      const climbVerificationCount: Record<string, number> = {}
      verificationCounts?.forEach(v => {
        climbVerificationCount[v.climb_id] = (climbVerificationCount[v.climb_id] || 0) + 1
      })

      // Log what we found
      for (const [imgId, rls] of routeLinesMap) {
        const approvedCount = rls.filter((rl) => rl.climbs?.[0]?.status === 'approved').length
      }

      // Filter and format images with valid route_lines
      const formattedImages: ImageData[] = []
      
      for (const img of imagesData) {
        const routeLines = routeLinesMap.get(img.id) || []
        
        // Include all climbs regardless of status
        const validRouteLines: ImageRoute[] = routeLines
          .filter((rl) => rl.climbs && rl.climbs.length > 0)
          .map((rl) => {
            const climbData = rl.climbs![0]
            return {
              id: rl.id,
              points: rl.points as RoutePoint[],
              color: rl.color,
              climb: {
                id: climbData.id,
                name: climbData.name,
                grade: climbData.grade,
                description: climbData.description
              }
            }
          })

        if (validRouteLines.length > 0) {
          // Compute verification status: image is verified if any climb has 3+ verifications
          let maxVerifications = 0
          for (const rl of routeLines) {
            if (rl.climb_id) {
              const count = climbVerificationCount[rl.climb_id] || 0
              if (count > maxVerifications) maxVerifications = count
            }
          }

          formattedImages.push({
            id: img.id,
            url: img.url,
            latitude: img.latitude,
            longitude: img.longitude,
            is_verified: maxVerifications >= 3,
            verification_count: maxVerifications,
            route_lines: validRouteLines
          })
        }
      }
      
      setImages(formattedImages)

      // Group images by crag_id and calculate average positions
      const cragsWithImages = new Map<string, typeof imagesData>()
      for (const img of imagesData) {
        if (!img.crag_id) continue
        const existing = cragsWithImages.get(img.crag_id) || []
        existing.push(img)
        cragsWithImages.set(img.crag_id, existing)
      }

      // Fetch crag names for those with images
      const cragIds = Array.from(cragsWithImages.keys())
      const { data: cragsInfo, error: cragsInfoError } = await supabase
        .from('crags')
        .select('id, name')
        .in('id', cragIds)

      const cragNames = new Map(cragsInfo?.map(c => [c.id, c.name]) || [])

      // Calculate average position for crags with 2+ images
      const pins: CragPin[] = []
      for (const [cragId, cragImages] of cragsWithImages) {
        if (cragImages.length >= 2) {
          const avgLat = cragImages.reduce((sum, img) => sum + (img.latitude || 0), 0) / cragImages.length
          const avgLng = cragImages.reduce((sum, img) => sum + (img.longitude || 0), 0) / cragImages.length
          pins.push({
            id: cragId,
            name: cragNames.get(cragId) || 'Unknown',
            latitude: avgLat,
            longitude: avgLng,
            imageCount: cragImages.length
          })
        }
      }
      setCragPins(pins)

      // Fetch crags with boundaries
      const { data: cragsData, error: cragsError } = await supabase
        .from('crags')
        .select('id, name, latitude, longitude, boundary')
        .not('boundary', 'is', null)

      if (cragsError) {
      } else if (cragsData) {
        setCrags(cragsData as CragData[])
      }

      localStorage.setItem(cacheKey, JSON.stringify({
        data: formattedImages,
        timestamp: Date.now()
      }))
    } catch (err) {
    }
    setLoading(false)
  }, [isClient])

  useEffect(() => {
    if (!isClient) return
    loadImages()
  }, [isClient])

  useEffect(() => {
    if (!isClient) return

    if (!navigator.geolocation) return

    setLocationStatus('requesting')

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords
        setUserLocation([latitude, longitude])
        setLocationStatus('tracking')
      },
      () => setLocationStatus('error'),
      { enableHighAccuracy: true, timeout: 15000 }
    )
  }, [isClient])

  useEffect(() => {
    if (!isClient) return

    const fetchUser = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      setUser(user)

      if (user) {
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
    fetchUser()
  }, [isClient])

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

  useEffect(() => {
    if (!mapRef.current || !userLocation) return
    if (useUserLocation) {
      mapRef.current.setView(userLocation, 5)
    }
  }, [useUserLocation, userLocation])

interface SkeletonPin {
  id: string
  latitude: number
  longitude: number
}

  const skeletonPins = useMemo(() => {
    if (images.length > 0) return [] as SkeletonPin[]
    const regions = [
      { lat: 49.45, lng: -2.6, name: 'Guernsey' },
      { lat: 51.5, lng: -0.12, name: 'London' },
      { lat: 40.7, lng: -74.0, name: 'New York' },
      { lat: 34.0, lng: -118.2, name: 'Los Angeles' },
      { lat: 48.8, lng: 2.3, name: 'Paris' },
    ]
    return regions.map((region, i): SkeletonPin => ({
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
          trackEvent('map_viewed', {
            has_user_location: !!userLocation,
            use_default_location: !useUserLocation,
          })
          setTimeout(() => {
            if (mapRef.current) {
              if (useUserLocation && userLocation) {
                mapRef.current.setView(userLocation, 5)
              } else if (defaultLocation) {
                mapRef.current.setView([defaultLocation.lat, defaultLocation.lng], defaultLocation.zoom)
              } else {
                mapRef.current.setView([49.45, -2.6], 5)
              }
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

        {/* Crag Polygons */}
        {crags.map(crag => {
          const coords = crag.boundary ? geoJsonPolygonToLeaflet(crag.boundary as GeoJSONPolygon) : null
          if (!coords || coords.length === 0) return null
          return (
            <Polygon
              key={crag.id}
              positions={coords}
              pathOptions={{
                color: '#3b82f6',
                fillColor: '#3b82f6',
                fillOpacity: 0.15,
                weight: 2,
                dashArray: '5, 10'
              }}
            >
              <Tooltip direction="center" opacity={1}>
                <span className="font-semibold">{crag.name}</span>
              </Tooltip>
            </Polygon>
          )
        })}

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

        {(!mapLoaded || loading) && skeletonPins.map((pin) => (
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
                background: ${image.is_verified ? '#22c55e' : '#eab308'};
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
              click: async (e: L.LeafletMouseEvent) => {
                e.originalEvent.stopPropagation()
                trackRouteClicked(image.id, `${image.route_lines.length} routes`)
                const supabase = createClient()
                const { data: { user } } = await supabase.auth.getUser()
                if (!user) {
                  window.location.href = `/auth?redirect_to=/image/${image.id}`
                } else {
                  window.location.href = `/image/${image.id}`
                }
              },
            }}
          >
            <Tooltip
              direction="top"
              offset={[0, -30]}
              opacity={1}
            >
              <div className="w-40">
                <div className="relative h-24 w-full mb-2 rounded overflow-hidden">
                  <img
                    src={image.url}
                    alt="Routes"
                    className="w-full h-full object-cover"
                  />
                </div>
                <p className="font-semibold text-sm text-gray-900">
                  {image.route_lines.length} route{image.route_lines.length !== 1 ? 's' : ''}
                </p>
                <p className={`text-xs ${image.is_verified ? 'text-green-600' : 'text-yellow-600'}`}>
                  {image.is_verified ? '✓ Verified' : `○ ${image.verification_count}/3 verified`}
                </p>
                <p className="text-xs text-blue-600 mt-1">Click to view →</p>
              </div>
            </Tooltip>
          </Marker>
        ))}

        {cragPins.map(crag => (
          <Marker
            key={crag.id}
            position={[crag.latitude, crag.longitude]}
            icon={L.divIcon({
              className: 'crag-pin',
              html: `<div style="
                background: #3b82f6;
                width: 32px;
                height: 32px;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 18px;
                border: 2px solid white;
                box-shadow: 0 2px 6px rgba(0,0,0,0.4);
              ">⛰️</div>`,
              iconSize: [32, 32],
              iconAnchor: [16, 16]
            })}
            zIndexOffset={1000}
            eventHandlers={{
              click: () => {
                window.location.href = `/crag/${crag.id}`
              },
            }}
          >
            <Tooltip direction="center" opacity={1}>
              <span className="font-semibold">{crag.name}</span>
            </Tooltip>
          </Marker>
        ))}
      </MapContainer>

      {(!mapLoaded || loading) && (
        <div className="absolute top-4 left-4 z-[1000] bg-white bg-opacity-90 rounded-lg px-3 py-2 text-sm text-gray-700 shadow-md">
          Loading routes...
        </div>
      )}

      <button
        onClick={() => {
          const cacheKey = CACHE_KEY + '_v3'
          localStorage.removeItem(cacheKey)
          // Force re-render by updating state
          setLoading(true)
          setTimeout(() => {
            loadImages()
          }, 50)
        }}
        className="absolute top-4 right-4 z-[1000] bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm shadow-md flex items-center gap-2 hover:bg-gray-50 dark:hover:bg-gray-700"
      >
        <RefreshCw className="w-4 h-4" />
        Refresh
      </button>

      {userLocation && (
        <button
          onClick={() => {
            setUseUserLocation(!useUserLocation)
            if (mapRef.current) {
              if (!useUserLocation) {
                mapRef.current.setView(userLocation, 5)
              } else if (defaultLocation) {
                mapRef.current.setView([defaultLocation.lat, defaultLocation.lng], defaultLocation.zoom)
              }
            }
          }}
          className={`absolute top-4 right-32 z-[1000] border rounded-lg px-3 py-2 text-sm shadow-md flex items-center gap-2 ${
            useUserLocation
              ? 'bg-blue-600 text-white border-blue-700'
              : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
          }`}
        >
          <MapPin className="w-4 h-4" />
          {useUserLocation ? 'My Location' : 'Use My Location'}
        </button>
      )}

      {locationStatus === 'requesting' && (
        <div className="absolute top-4 right-20 z-[1000] bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm">
          Requesting location...
        </div>
      )}

      {useUserLocation && userLocation && defaultLocation && (
        <button
          onClick={() => {
            setUseUserLocation(false)
            if (mapRef.current) {
              mapRef.current.setView([defaultLocation.lat, defaultLocation.lng], defaultLocation.zoom)
            }
          }}
          className="absolute bottom-24 left-4 z-[1000] bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm shadow-md flex items-center gap-2"
        >
          <MapPin className="w-4 h-4" />
          Go to Default Location
        </button>
      )}
    </div>
  )
}
