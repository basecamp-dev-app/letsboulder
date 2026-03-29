'use client'

import { useEffect, useState, useCallback, useMemo, useRef, type RefObject, startTransition } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import L from 'leaflet'
import { Bookmark } from 'lucide-react'
import Supercluster from 'supercluster'
import type { User } from '@supabase/supabase-js'
import { csrfFetch } from '@/hooks/useCsrf'
import { useMapEvents } from 'react-leaflet'
import MapLoadingShell from '@/components/map/MapLoadingShell'
import { runWhenIdle } from '@/lib/run-when-idle'

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

interface PlacePin {
  id: string
  name: string
  type: 'crag' | 'gym'
  latitude: number
  longitude: number
  slug: string | null
  country_code: string | null
  image_count: number | null
  route_count: number | null
}

interface MapBounds {
  north: number
  south: number
  east: number
  west: number
}

interface ClusterProperties extends PlacePin {
  cluster: false
  placeCount: 1
}

interface ClusterPointProperties {
  cluster: true
  cluster_id: number
  point_count: number
  point_count_abbreviated: string | number
}

type ClusterFeature = GeoJSON.Feature<GeoJSON.Point, ClusterPointProperties>
type PinFeature = GeoJSON.Feature<GeoJSON.Point, ClusterProperties>
type ClusterResult = ClusterFeature | PinFeature

function isClusterFeature(feature: ClusterResult): feature is ClusterFeature {
  return feature.properties.cluster === true
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

function MapInteractionWatcher({ onInteract }: { onInteract: () => void }) {
  useMapEvents({
    click: onInteract,
    mousedown: onInteract,
    zoomstart: onInteract,
    movestart: onInteract,
  })

  return null
}

export default function SatelliteClimbingMap() {
  const router = useRouter()
  const mapRef = useRef<L.Map | null>(null)
  const [isClient, setIsClient] = useState(false)
  const [hasUserInteracted, setHasUserInteracted] = useState(false)
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null)
  const [locationStatus, setLocationStatus] = useState<'idle' | 'requesting' | 'tracking' | 'error'>('idle')
  const [mapLoaded, setMapLoaded] = useState(false)
  const [user, setUser] = useState<User | null>(null)
  const [defaultLocation, setDefaultLocation] = useState<{lat: number; lng: number; zoom: number} | null>(null)
  const [, setIsAtDefaultLocation] = useState(true)
  const [placePins, setPlacePins] = useState<PlacePin[]>([])
  const [mapZoom, setMapZoom] = useState(WORLD_DEFAULT_ZOOM)
  const [mapBounds, setMapBounds] = useState<MapBounds | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [saveLocationLoading, setSaveLocationLoading] = useState(false)

  const handleMapStateChange = useCallback((state: { zoom: number; bounds: MapBounds }) => {
    setMapZoom(state.zoom)
    setMapBounds(state.bounds)
  }, [])

  const markMapInteracted = useCallback(() => {
    setHasUserInteracted(true)
  }, [])

  const pinFeatures = useMemo<PinFeature[]>(() => {
    return placePins.map((pin) => ({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [pin.longitude, pin.latitude],
      },
      properties: {
        ...pin,
        cluster: false,
        placeCount: 1,
      },
    }))
  }, [placePins])

  const clusterIndex = useMemo(() => {
    const index = new Supercluster<ClusterProperties, ClusterPointProperties>({
      radius: 56,
      maxZoom: 16,
      minZoom: 0,
      minPoints: 2,
    })
    index.load(pinFeatures)
    return index
  }, [pinFeatures])

  const clusteredPlaces = useMemo<ClusterResult[]>(() => {
    if (pinFeatures.length === 0) return []

    const zoom = Math.max(0, Math.floor(mapZoom))
    const worldBounds: [number, number, number, number] = [-180, -85, 180, 85]

    if (!mapBounds) {
      return clusterIndex.getClusters(worldBounds, zoom) as ClusterResult[]
    }

    const north = Math.min(85, mapBounds.north)
    const south = Math.max(-85, mapBounds.south)

    if (mapBounds.west <= mapBounds.east) {
      return clusterIndex.getClusters([mapBounds.west, south, mapBounds.east, north], zoom) as ClusterResult[]
    }

    const westClusters = clusterIndex.getClusters([mapBounds.west, south, 180, north], zoom) as ClusterResult[]
    const eastClusters = clusterIndex.getClusters([-180, south, mapBounds.east, north], zoom) as ClusterResult[]
    return [...westClusters, ...eastClusters]
  }, [clusterIndex, mapBounds, mapZoom, pinFeatures.length])

  useEffect(() => {
    setupLeafletIcons()
  }, [])

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 2000)
      return () => clearTimeout(timer)
    }
  }, [toast])

  const loadPlacePins = useCallback(async () => {
    if (!isClient) {
      return
    }

    try {
      const pinsResponse = await fetch('/api/crags/pins')
      if (!pinsResponse.ok) {
        console.error('Error fetching place pins:', pinsResponse.status)
        setPlacePins([])
        return
      }

      const { pins: apiPins } = await pinsResponse.json()
      setPlacePins((apiPins || []) as PlacePin[])
    } catch (err) {
      console.error('Error loading place pins:', err)
      setPlacePins([])
    }
  }, [isClient])

  useEffect(() => {
    if (!isClient || !mapLoaded || !hasUserInteracted) return
    return runWhenIdle(() => {
      void loadPlacePins()
    }, 150)
  }, [hasUserInteracted, isClient, loadPlacePins, mapLoaded])

  useEffect(() => {
    if (!isClient || !mapLoaded || !hasUserInteracted) return

    if (!navigator.geolocation) return

    return runWhenIdle(() => {
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
    }, 400)
  }, [hasUserInteracted, isClient, mapLoaded])

  useEffect(() => {
    if (!isClient || !mapLoaded || !hasUserInteracted) return

    let ignore = false

    const fetchUser = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (ignore) return
      setUser(user)

      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('default_location_lat, default_location_lng, default_location_zoom')
          .eq('id', user.id)
          .single()

        if (ignore) return

        if (
          profile?.default_location_lat !== null
          && profile?.default_location_lat !== undefined
          && profile?.default_location_lng !== null
          && profile?.default_location_lng !== undefined
        ) {
          setDefaultLocation({
            lat: profile.default_location_lat,
            lng: profile.default_location_lng,
            zoom: profile.default_location_zoom || 12
          })
        }
      }
    }

    const handleFocus = () => {
      fetchUser()
    }

    const cancelIdle = runWhenIdle(() => {
      void fetchUser()
    }, 450)
    window.addEventListener('focus', handleFocus)
    return () => {
      ignore = true
      cancelIdle()
      window.removeEventListener('focus', handleFocus)
    }
    }, [hasUserInteracted, isClient, mapLoaded])

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
      if (!mapRef.current || !mapLoaded) return

      if (defaultLocation) {
        mapRef.current.setView([defaultLocation.lat, defaultLocation.lng], defaultLocation.zoom)
      } else {
        mapRef.current.setView(WORLD_DEFAULT_VIEW, WORLD_DEFAULT_ZOOM)
      }
    }, [mapLoaded, defaultLocation])
  if (!isClient) {
    return <MapLoadingShell />
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
        preferCanvas={true}
        zoomControl={false}
        scrollWheelZoom={true}
        worldCopyJump={false}
        whenReady={() => {
          setMapLoaded(true)
        }}
      >
        <DefaultLocationWatcher defaultLocation={defaultLocation} mapRef={mapRef} />
        <MapStateWatcher onStateChange={handleMapStateChange} />
        <MapInteractionWatcher onInteract={markMapInteracted} />
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

        {clusteredPlaces.map((feature) => {
          const [longitude, latitude] = feature.geometry.coordinates

          if (!isClusterFeature(feature)) {
            const place = feature.properties
            const isGym = place.type === 'gym'
            return (
              <Marker
                key={place.id}
                position={[latitude, longitude]}
                icon={L.divIcon({
                  className: isGym ? 'gym-pin' : 'crag-pin',
                  html: `<div class="place-dot ${isGym ? 'gym-dot' : 'crag-dot'}"></div>`,
                  iconSize: [20, 20],
                  iconAnchor: [10, 10]
                })}
                zIndexOffset={1000}
                eventHandlers={{
                  click: () => {
                    if (isGym && place.slug) {
                      startTransition(() => {
                        router.push(`/gyms/${place.slug}`)
                      })
                      return
                    }

                    if (place.slug && place.country_code) {
                      const countryCode = place.country_code
                      startTransition(() => {
                        router.push(`/${countryCode.toLowerCase()}/${place.slug}`)
                      })
                      return
                    }

                    startTransition(() => {
                      router.push(`/crag/${place.id}`)
                    })
                  },
                }}
              >
                <Tooltip direction="center" opacity={1}>
                  <span className="font-semibold">{place.name}</span>
                </Tooltip>
              </Marker>
            )
          }

          return (
            <Marker
              key={`cluster-${feature.properties.cluster_id}`}
              position={[latitude, longitude]}
              icon={L.divIcon({
                className: 'crag-cluster-wrapper',
                html: `<div class="crag-cluster-pin">${feature.properties.point_count}</div>`,
                iconSize: [36, 36],
                iconAnchor: [18, 18]
              })}
              zIndexOffset={1200}
              eventHandlers={{
                click: () => {
                  if (!mapRef.current) return
                  const expansionZoom = Math.min(clusterIndex.getClusterExpansionZoom(feature.properties.cluster_id), 17)
                  mapRef.current.setView([latitude, longitude], expansionZoom, {
                    animate: true,
                    duration: 0.5
                  })
                }
              }}
            />
          )
        })}
      </MapContainer>
      {!mapLoaded ? (
        <div className="pointer-events-none absolute inset-0 z-[900] transition-opacity duration-300">
          <MapLoadingShell />
        </div>
      ) : null}
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

      {toast && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[1100] px-4 py-2 bg-green-600 text-white rounded-lg shadow-lg text-sm font-medium">
          {toast}
        </div>
      )}
    </div>
  )
}
