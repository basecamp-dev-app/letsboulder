'use client'

import { useEffect, useState, useCallback, useMemo, useRef, type RefObject } from 'react'
import dynamic from 'next/dynamic'
import { createClient } from '@/lib/supabase'
import L from 'leaflet'
import { MapPin, Bookmark } from 'lucide-react'
import type { User } from '@supabase/supabase-js'
import { csrfFetch } from '@/hooks/useCsrf'
import { useMapEvents } from 'react-leaflet'

import 'leaflet/dist/leaflet.css'

interface LeafletIconDefault {
  prototype: {
    _getIconUrl?: () => void
  }
  mergeOptions: (options: Record<string, string>) => void
}

function setupLeafletIcons() {
  if (typeof window !== 'undefined') {
    delete (L.Icon.Default as unknown as LeafletIconDefault).prototype._getIconUrl
    ;(L.Icon.Default as unknown as LeafletIconDefault).mergeOptions({
      iconRetinaUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
      iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png',
      shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
    })
  }
}

const MapContainer = dynamic(() => import('react-leaflet').then(mod => mod.MapContainer), { ssr: false })
const TileLayer = dynamic(() => import('react-leaflet').then(mod => mod.TileLayer), { ssr: false })
const Marker = dynamic(() => import('react-leaflet').then(mod => mod.Marker), { ssr: false })
const Tooltip = dynamic(() => import('react-leaflet').then(mod => mod.Tooltip), { ssr: false })

interface DefaultLocation {
  lat: number
  lng: number
  zoom: number
}

const WORLD_DEFAULT_VIEW: [number, number] = [20, 0]
const WORLD_DEFAULT_ZOOM = 2

function DefaultLocationWatcher({ defaultLocation, mapRef }: { defaultLocation: DefaultLocation | null; mapRef: React.RefObject<L.Map | null> }) {
  useEffect(() => {
    if (defaultLocation && mapRef.current) {
      mapRef.current.setView([defaultLocation.lat, defaultLocation.lng], defaultLocation.zoom)
    }
  }, [defaultLocation, mapRef])
  return null
}

interface CragPin {
  id: string
  name: string
  latitude: number
  longitude: number
  imageCount: number
}

interface MapBounds {
  north: number
  south: number
  east: number
  west: number
}

interface CragCluster {
  id: string
  latitude: number
  longitude: number
  crags: CragPin[]
  cragCount: number
}

function getClusterGridSize(zoom: number): number {
  if (zoom <= 4) return 6
  if (zoom <= 6) return 3
  if (zoom <= 8) return 1.2
  if (zoom <= 10) return 0.3
  if (zoom <= 11) return 0.12
  if (zoom <= 12) return 0.05
  if (zoom <= 13) return 0.025
  return 0.012
}

function isLngWithinBounds(lng: number, bounds: MapBounds): boolean {
  if (bounds.west <= bounds.east) {
    return lng >= bounds.west && lng <= bounds.east
  }
  return lng >= bounds.west || lng <= bounds.east
}

function MapStateWatcher({
  onStateChange
}: {
  onStateChange: (state: { zoom: number; bounds: MapBounds }) => void
}) {
  const map = useMapEvents({
    moveend: () => {
      const bounds = map.getBounds()
      onStateChange({
        zoom: map.getZoom(),
        bounds: {
          north: bounds.getNorth(),
          south: bounds.getSouth(),
          east: bounds.getEast(),
          west: bounds.getWest()
        }
      })
    },
    zoomend: () => {
      const bounds = map.getBounds()
      onStateChange({
        zoom: map.getZoom(),
        bounds: {
          north: bounds.getNorth(),
          south: bounds.getSouth(),
          east: bounds.getEast(),
          west: bounds.getWest()
        }
      })
    }
  })

  useEffect(() => {
    const bounds = map.getBounds()
    onStateChange({
      zoom: map.getZoom(),
      bounds: {
        north: bounds.getNorth(),
        south: bounds.getSouth(),
        east: bounds.getEast(),
        west: bounds.getWest()
      }
    })
  }, [map, onStateChange])

  return null
}

export default function SatelliteClimbingMap() {
  const mapRef = useRef<L.Map | null>(null)
  const [isClient, setIsClient] = useState(false)
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null)
  const [locationStatus, setLocationStatus] = useState<'idle' | 'requesting' | 'tracking' | 'error'>('idle')
  const [mapLoaded, setMapLoaded] = useState(false)
  const [user, setUser] = useState<User | null>(null)
  const [defaultLocation, setDefaultLocation] = useState<{lat: number; lng: number; zoom: number} | null>(null)
  const [, setIsAtDefaultLocation] = useState(true)
  const [useUserLocation, setUseUserLocation] = useState(false)
  const [cragPins, setCragPins] = useState<CragPin[]>([])
  const [mapZoom, setMapZoom] = useState(WORLD_DEFAULT_ZOOM)
  const [mapBounds, setMapBounds] = useState<MapBounds | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [saveLocationLoading, setSaveLocationLoading] = useState(false)
  const [defaultLocationLoading, setDefaultLocationLoading] = useState(true)

  const handleMapStateChange = useCallback((state: { zoom: number; bounds: MapBounds }) => {
    setMapZoom(state.zoom)
    setMapBounds(state.bounds)
  }, [])

  const clusteredCrags = useMemo<CragCluster[]>(() => {
    if (cragPins.length === 0) return []

    const visiblePins = mapBounds
      ? cragPins.filter((pin) => {
          const inLat = pin.latitude >= mapBounds.south && pin.latitude <= mapBounds.north
          const inLng = isLngWithinBounds(pin.longitude, mapBounds)
          return inLat && inLng
        })
      : cragPins

    if (visiblePins.length === 0) return []

    if (mapZoom >= 12) {
      return visiblePins.map((pin) => ({
        id: pin.id,
        latitude: pin.latitude,
        longitude: pin.longitude,
        crags: [pin],
        cragCount: 1,
      }))
    }

    const gridSize = getClusterGridSize(mapZoom)
    const buckets = new Map<string, CragPin[]>()

    for (const pin of visiblePins) {
      const latBucket = Math.floor(pin.latitude / gridSize)
      const lngBucket = Math.floor(pin.longitude / gridSize)
      const bucketKey = `${latBucket}:${lngBucket}`
      const bucket = buckets.get(bucketKey) || []
      bucket.push(pin)
      buckets.set(bucketKey, bucket)
    }

    return Array.from(buckets.entries()).map(([bucketKey, bucket]) => {
      const latitude = bucket.reduce((sum, pin) => sum + pin.latitude, 0) / bucket.length
      const longitude = bucket.reduce((sum, pin) => sum + pin.longitude, 0) / bucket.length

      return {
        id: bucketKey,
        latitude,
        longitude,
        crags: bucket,
        cragCount: bucket.length
      }
    })
  }, [cragPins, mapBounds, mapZoom])

  useEffect(() => {
    setupLeafletIcons()
  }, [])

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 2000)
      return () => clearTimeout(timer)
    }
  }, [toast])

  const loadCragPins = useCallback(async () => {
    if (!isClient) {
      return
    }

    try {
      const pinsResponse = await fetch('/api/crags/pins')
      if (!pinsResponse.ok) {
        console.error('Error fetching crag pins:', pinsResponse.status)
        setCragPins([])
        return
      }

      const { pins: apiPins } = await pinsResponse.json()
      setCragPins((apiPins || []) as CragPin[])
    } catch (err) {
      console.error('Error loading crag pins:', err)
      setCragPins([])
    }
  }, [isClient])

  useEffect(() => {
    if (!isClient) return
    loadCragPins()
  }, [isClient, loadCragPins])

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

    let ignore = false

    const fetchUser = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      console.log('[Map] fetchUser - user:', user?.id)
      if (ignore) return
      setUser(user)

      if (user) {
        const { data: profile, error } = await supabase
          .from('profiles')
          .select('default_location_lat, default_location_lng, default_location_zoom')
          .eq('id', user.id)
          .single()

        console.log('[Map] Profile fetch result:', { profile, error })
        setDefaultLocationLoading(false)

        if (ignore) return

        if (
          profile?.default_location_lat !== null
          && profile?.default_location_lat !== undefined
          && profile?.default_location_lng !== null
          && profile?.default_location_lng !== undefined
        ) {
          console.log('[Map] Setting defaultLocation:', {
            lat: profile.default_location_lat,
            lng: profile.default_location_lng,
            zoom: profile.default_location_zoom || 12
          })
          setDefaultLocation({
            lat: profile.default_location_lat,
            lng: profile.default_location_lng,
            zoom: profile.default_location_zoom || 12
          })
        } else {
          console.log('[Map] No default_location in profile')
        }
      } else {
        setDefaultLocationLoading(false)
      }
    }

    const handleFocus = () => {
      fetchUser()
    }

    fetchUser()
    window.addEventListener('focus', handleFocus)
    return () => {
      ignore = true
      window.removeEventListener('focus', handleFocus)
    }
    }, [isClient])

  const handleSaveAsDefault = async () => {
    if (!mapRef.current || !user) {
      setToast('Please log in to save a default location')
      return
    }

    const center = mapRef.current.getCenter()
    const zoom = mapRef.current.getZoom()

    setSaveLocationLoading(true)
    try {
      const response = await csrfFetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          defaultLocationLat: center.lat,
          defaultLocationLng: center.lng,
          defaultLocationZoom: zoom
        })
      })

      if (response.ok) {
        setDefaultLocation({ lat: center.lat, lng: center.lng, zoom })
        setToast('view saved')
      } else {
        setToast('Failed to save location')
      }
    } catch {
      setToast('Failed to save location')
    } finally {
      setSaveLocationLoading(false)
    }
  }

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

    useEffect(() => {
      if (!mapRef.current || !mapLoaded) return

      console.log('[Map] Centering effect - mapLoaded:', mapLoaded, 'useUserLocation:', useUserLocation, 'userLocation:', userLocation, 'defaultLocation:', defaultLocation)

      if (useUserLocation && userLocation) {
        console.log('[Map] Centering on userLocation:', userLocation)
        mapRef.current.setView(userLocation, 11)
      } else if (defaultLocation) {
        console.log('[Map] Centering on defaultLocation:', { lat: defaultLocation.lat, lng: defaultLocation.lng, zoom: defaultLocation.zoom })
        mapRef.current.setView([defaultLocation.lat, defaultLocation.lng], defaultLocation.zoom)
      } else {
        console.log('[Map] No saved location, falling back to world view')
        mapRef.current.setView(WORLD_DEFAULT_VIEW, WORLD_DEFAULT_ZOOM)
      }
    }, [mapLoaded, defaultLocation, userLocation, useUserLocation])





  if (!isClient) {
    return <div className="h-screen w-full bg-gray-900" />
  }

  if (user && defaultLocationLoading) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-gray-900">
        <div className="text-white">Loading...</div>
      </div>
    )
  }

  return (
    <div className="h-screen w-full relative">
      <MapContainer
        ref={mapRef as RefObject<L.Map>}
        center={WORLD_DEFAULT_VIEW}
        zoom={WORLD_DEFAULT_ZOOM}
        minZoom={2}
        maxZoom={19}
        maxBounds={[[-90, -180], [90, 180]]}
        style={{ height: '100%', width: '100%' }}
        zoomControl={false}
        scrollWheelZoom={true}
        worldCopyJump={false}
        whenReady={() => {
          setMapLoaded(true)
        }}
      >
        <DefaultLocationWatcher defaultLocation={defaultLocation} mapRef={mapRef} />
        <MapStateWatcher onStateChange={handleMapStateChange} />
        <TileLayer
          url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
          attribution='Imagery © Esri'
          maxZoom={19}
        />
        <TileLayer
          url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"
          attribution='Labels © Esri'
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

        {clusteredCrags.map((cluster) => {
          if (cluster.cragCount === 1) {
            const crag = cluster.crags[0]
            return (
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
            )
          }

          const iconSize = cluster.cragCount > 99 ? 44 : cluster.cragCount > 9 ? 38 : 34

          return (
            <Marker
              key={cluster.id}
              position={[cluster.latitude, cluster.longitude]}
              icon={L.divIcon({
                className: 'crag-cluster-wrapper',
                html: `<div class="crag-cluster-pin" style="width:${iconSize}px;height:${iconSize}px;">${cluster.cragCount}</div>`,
                iconSize: [iconSize, iconSize],
                iconAnchor: [iconSize / 2, iconSize / 2]
              })}
              zIndexOffset={1200}
              eventHandlers={{
                click: () => {
                  if (!mapRef.current) return
                  const nextZoom = Math.min(mapRef.current.getZoom() + 2, 19)
                  mapRef.current.setView([cluster.latitude, cluster.longitude], nextZoom)
                }
              }}
            >
              <Tooltip direction="center" opacity={1}>
                <span className="font-semibold">{cluster.cragCount} crags</span>
              </Tooltip>
            </Marker>
          )
        })}
      </MapContainer>


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

      <button
        onClick={handleSaveAsDefault}
        disabled={saveLocationLoading}
        className="absolute left-4 top-[80px] z-[1100] bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md px-2 py-1.5 text-xs shadow-md flex items-center gap-1.5 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
      >
        <Bookmark className="w-3.5 h-3.5" />
        {saveLocationLoading ? 'Saving...' : 'Save view'}
      </button>

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
          className="absolute bottom-[calc(5rem+env(safe-area-inset-bottom))] left-4 z-[1000] bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm shadow-md flex items-center gap-2"
        >
          <MapPin className="w-4 h-4" />
          Go to Default Location
        </button>
      )}

      {toast && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[1100] px-4 py-2 bg-green-600 text-white rounded-lg shadow-lg text-sm font-medium">
          {toast}
        </div>
      )}
    </div>
  )
}
