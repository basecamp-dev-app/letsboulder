'use client'

import { useEffect, useState, useCallback, useMemo, useRef, type RefObject, startTransition } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { Bookmark, Crosshair, Loader2 } from 'lucide-react'
import type { User } from '@supabase/supabase-js'
import { saveSettingsAction } from '@/features/settings/actions/save-settings'
import { useMapEvents } from 'react-leaflet'
import { runWhenIdle } from '@/lib/run-when-idle'
import { buildPinFeatures, isClusterFeature, type ClusterIndex, type ClusterResult, type PinFeature, type PlacePin } from '@/lib/map/place-pins'
import { getMapBaseLayerConfig } from '@/lib/map/base-layer'
import { reportError } from '@/lib/errors'

import 'leaflet/dist/leaflet.css'

interface LeafletIconDefault {
  prototype: {
    _getIconUrl?: () => void
  }
  mergeOptions: (options: Record<string, string>) => void
}

function setupLeafletIcons(leaflet: typeof import('leaflet')) {
  if (typeof window !== 'undefined') {
    delete (leaflet.Icon.Default as LeafletIconDefault).prototype._getIconUrl
    ;(leaflet.Icon.Default as LeafletIconDefault).mergeOptions({
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

function buildPlaceHref(place: Pick<PlacePin, 'id' | 'slug' | 'country_code' | 'type' | 'name'>) {
  if (place.type === 'gym' && place.slug) {
    return `/gyms/${place.slug}`
  }

  if (place.slug && place.country_code) {
    return `/${place.country_code.toLowerCase()}/${place.slug}`
  }

  if (place.type === 'crag') {
    return `/crag/${place.id}`
  }

  return `/crag/${place.id}`
}

function navigateToPlace(router: ReturnType<typeof useRouter>, place: Pick<PlacePin, 'id' | 'slug' | 'country_code' | 'type' | 'name'>) {
  startTransition(() => {
    router.push(buildPlaceHref(place))
  })
}

function DefaultLocationWatcher({ defaultLocation, mapRef }: { defaultLocation: DefaultLocation | null; mapRef: React.RefObject<L.Map | null> }) {
  useEffect(() => {
    if (defaultLocation && mapRef.current) {
      mapRef.current.setView([defaultLocation.lat, defaultLocation.lng], defaultLocation.zoom)
    }
  }, [defaultLocation, mapRef])
  return null
}

interface MapBounds {
  north: number
  south: number
  east: number
  west: number
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

function MapInteractionWatcher({ onInteract, onClearSelection }: { onInteract: () => void; onClearSelection: () => void }) {
  useMapEvents({
    click: () => {
      onInteract()
      onClearSelection()
    },
    mousedown: () => {
      onInteract()
      onClearSelection()
    },
    zoomstart: () => {
      onInteract()
      onClearSelection()
    },
    movestart: () => {
      onInteract()
      onClearSelection()
    },
  })

  return null
}

export default function SatelliteClimbingMap({
  initialPlacePins = [],
  onReady,
}: {
  initialPlacePins?: PlacePin[]
  onReady?: () => void
}) {
  const router = useRouter()
  const mapRef = useRef<L.Map | null>(null)
  const [isClient, setIsClient] = useState(false)
  const [leaflet, setLeaflet] = useState<typeof import('leaflet') | null>(null)
  const [hasUserInteracted, setHasUserInteracted] = useState(false)
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null)
  const [locationStatus, setLocationStatus] = useState<'idle' | 'requesting' | 'tracking' | 'error'>('idle')
  const [mapLoaded, setMapLoaded] = useState(false)
  const [user, setUser] = useState<User | null>(null)
  const [defaultLocation, setDefaultLocation] = useState<{lat: number; lng: number; zoom: number} | null>(null)
  const [, setIsAtDefaultLocation] = useState(true)
  const [placePins, setPlacePins] = useState<PlacePin[]>(initialPlacePins)
  const [pinLoadState, setPinLoadState] = useState<'idle' | 'loading' | 'ready' | 'error'>(initialPlacePins.length > 0 ? 'ready' : 'idle')
  const [mapZoom, setMapZoom] = useState(WORLD_DEFAULT_ZOOM)
  const [mapBounds, setMapBounds] = useState<MapBounds | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [saveLocationLoading, setSaveLocationLoading] = useState(false)
  const [clusterIndex, setClusterIndex] = useState<ClusterIndex | null>(null)
  const [hasDefaultLocation, setHasDefaultLocation] = useState(false)
  const [isOffline, setIsOffline] = useState(false)
  const [selectedPinId, setSelectedPinId] = useState<string | null>(null)

  const handleMapStateChange = useCallback((state: { zoom: number; bounds: MapBounds }) => {
    setMapZoom(state.zoom)
    setMapBounds(state.bounds)
  }, [])

  const markMapInteracted = useCallback(() => {
    setHasUserInteracted(true)
  }, [])

  const pinFeatures = useMemo<PinFeature[]>(() => buildPinFeatures(placePins), [placePins])
  const baseLayer = useMemo(() => getMapBaseLayerConfig({ offline: isOffline }), [isOffline])
  const isPinsOnlyOfflineMode = baseLayer.mode === 'offline-pins-only'

  useEffect(() => {
    if (typeof window === 'undefined') return

    const updateOnlineStatus = () => setIsOffline(window.navigator.onLine === false)
    updateOnlineStatus()
    window.addEventListener('online', updateOnlineStatus)
    window.addEventListener('offline', updateOnlineStatus)

    return () => {
      window.removeEventListener('online', updateOnlineStatus)
      window.removeEventListener('offline', updateOnlineStatus)
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    if (pinFeatures.length === 0) {
      setClusterIndex(null)
      return
    }

    void import('supercluster').then((mod) => {
      if (cancelled) return

      const SuperclusterLib = mod.default
      const index = new SuperclusterLib({
        radius: 56,
        maxZoom: 16,
        minZoom: 0,
        minPoints: 2,
      }) as ClusterIndex
      index.load(pinFeatures)
      setClusterIndex(index)
    }).catch(() => {
      if (!cancelled) {
        setClusterIndex(null)
      }
    })

    return () => {
      cancelled = true
    }
  }, [pinFeatures])

  const clusteredPlaces = useMemo<ClusterResult[]>(() => {
    if (pinFeatures.length === 0 || !clusterIndex) return pinFeatures

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
  }, [clusterIndex, mapBounds, mapZoom, pinFeatures])

  useEffect(() => {
    import('leaflet').then(Lib => {
      setLeaflet(Lib)
      setupLeafletIcons(Lib)
    })
  }, [])

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 2000)
      return () => clearTimeout(timer)
    }
  }, [toast])

  const loadPlacePins = useCallback(async () => {
    if (!isClient || initialPlacePins.length > 0) {
      if (initialPlacePins.length > 0) {
        setPinLoadState('ready')
      }
      return
    }

    try {
      setPinLoadState('loading')
      const pinsResponse = await fetch('/api/crags/pins')
      if (!pinsResponse.ok) {
        reportError(new Error('Error fetching place pins'), { message: 'Error fetching place pins', extra: { status: pinsResponse.status } })
        setPlacePins([])
        setPinLoadState('error')
        return
      }

      const { pins: apiPins } = await pinsResponse.json()
      setPlacePins((apiPins || []) as PlacePin[])
      setPinLoadState('ready')
    } catch (err) {
      reportError(err instanceof Error ? err : new Error('Error loading place pins'), { message: 'Error loading place pins' })
      setPlacePins([])
      setPinLoadState('error')
    }
  }, [initialPlacePins.length, isClient])

  useEffect(() => {
    if (!isClient || !mapLoaded) return
    return runWhenIdle(() => {
      void loadPlacePins()
    }, 150)
  }, [isClient, loadPlacePins, mapLoaded])

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
          setHasDefaultLocation(true)
          setDefaultLocation({
            lat: profile.default_location_lat,
            lng: profile.default_location_lng,
            zoom: profile.default_location_zoom || 12
          })
        } else {
          setHasDefaultLocation(false)
        }
      } else {
        setHasDefaultLocation(false)
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

  const handleLocateMe = useCallback(() => {
    setHasUserInteracted(true)

    if (!navigator.geolocation) {
      setLocationStatus('error')
      return
    }

    setLocationStatus('requesting')
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords
        const nextLocation: [number, number] = [latitude, longitude]
        setUserLocation(nextLocation)
        setLocationStatus('tracking')
        if (mapRef.current) {
          mapRef.current.setView(nextLocation, 10, {
            animate: true,
            duration: 0.5,
          })
        }
      },
      () => setLocationStatus('error'),
      { enableHighAccuracy: true, timeout: 15000 }
    )
  }, [])

  const handleSaveAsDefault = async () => {
    if (!mapRef.current || !user) {
      setToast('Please log in to save a default location')
      return
    }

    const center = mapRef.current.getCenter()
    const zoom = mapRef.current.getZoom()

    setSaveLocationLoading(true)
    try {
      const result = await saveSettingsAction({
        defaultLocationLat: center.lat,
        defaultLocationLng: center.lng,
        defaultLocationZoom: zoom,
      })

      if (result.success) {
        setDefaultLocation({ lat: center.lat, lng: center.lng, zoom })
        setToast('view saved')
      } else {
        setToast(result.error || 'Failed to save location')
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

      if (isPinsOnlyOfflineMode && pinFeatures.length > 0) {
        const bounds = pinFeatures.map((feature) => {
          const [longitude, latitude] = feature.geometry.coordinates
          return [latitude, longitude] as [number, number]
        })

        mapRef.current.fitBounds(bounds, {
          padding: [32, 32],
          maxZoom: 12,
        })
        return
      }

      if (defaultLocation) {
        mapRef.current.setView([defaultLocation.lat, defaultLocation.lng], defaultLocation.zoom)
      } else {
        mapRef.current.setView(WORLD_DEFAULT_VIEW, WORLD_DEFAULT_ZOOM)
      }
    }, [mapLoaded, defaultLocation, isPinsOnlyOfflineMode, pinFeatures])

  return (
    <div className="h-screen w-full relative">
      {isPinsOnlyOfflineMode ? <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(71,85,105,0.32),_transparent_48%),linear-gradient(180deg,_#020617_0%,_#0f172a_100%)]" /> : null}
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
          onReady?.()
        }}
      >
        <DefaultLocationWatcher defaultLocation={defaultLocation} mapRef={mapRef} />
        <MapStateWatcher onStateChange={handleMapStateChange} />
        <MapInteractionWatcher onInteract={markMapInteracted} onClearSelection={() => setSelectedPinId(null)} />
        {!isPinsOnlyOfflineMode ? <TileLayer
          url={baseLayer.imageryUrl}
          attribution={baseLayer.imageryAttribution}
          maxZoom={19}
        /> : null}
        {!isPinsOnlyOfflineMode && baseLayer.labelsUrl ? (
          <TileLayer
            url={baseLayer.labelsUrl}
            attribution={baseLayer.labelsAttribution || undefined}
            maxZoom={19}
          />
        ) : null}

        {userLocation && leaflet && (
          <Marker
            position={userLocation}
            icon={leaflet.divIcon({
              className: 'user-location-dot',
              iconSize: [12, 12],
              iconAnchor: [6, 6]
            })}
          />
        )}

        {leaflet && clusteredPlaces.map((feature) => {
          const [longitude, latitude] = feature.geometry.coordinates

          if (!isClusterFeature(feature)) {
            const place = feature.properties
            const isGym = place.type === 'gym'
            const isSelected = selectedPinId === place.id
            return (
              <Marker
                key={place.id}
                position={[latitude, longitude]}
                icon={leaflet.divIcon({
                  className: isGym ? 'gym-pin' : 'crag-pin',
                  html: `<div class="place-dot ${isGym ? 'gym-dot' : 'crag-dot'}"></div>`,
                  iconSize: [20, 20],
                  iconAnchor: [10, 10]
                })}
                zIndexOffset={1000}
                eventHandlers={{
                  click: () => {
                    if (isSelected) {
                      navigateToPlace(router, place)
                    } else {
                      setSelectedPinId(place.id)
                    }
                  },
                }}
              >
                <Tooltip direction="center" opacity={isSelected ? 1 : 0}>
                  <span className="font-semibold">{place.name}</span>
                </Tooltip>
              </Marker>
            )
          }

          return (
            <Marker
              key={`cluster-${feature.properties.cluster_id}`}
              position={[latitude, longitude]}
              icon={leaflet.divIcon({
                className: 'crag-cluster-wrapper',
                html: `<div class="crag-cluster-pin">${feature.properties.point_count}</div>`,
                iconSize: [36, 36],
                iconAnchor: [18, 18]
              })}
              zIndexOffset={1200}
              eventHandlers={{
                click: () => {
                  if (!mapRef.current) return
                    if (!clusterIndex) return
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
      <button
        type="button"
        onClick={handleLocateMe}
        className="absolute left-4 top-4 z-[1200] inline-flex items-center gap-2 rounded-full border border-white/12 bg-slate-950/72 px-3 py-2 text-sm text-white shadow-lg backdrop-blur-md transition hover:bg-slate-950/82 md:left-6 md:top-6"
      >
        {locationStatus === 'requesting' ? <Loader2 className="size-4 animate-spin" /> : <Crosshair className="size-4" />}
        {locationStatus === 'requesting' ? 'Locating...' : 'Use my location'}
      </button>
      <button
        onClick={handleSaveAsDefault}
        disabled={saveLocationLoading}
        className="absolute left-4 top-[60px] z-[1100] bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md px-2 py-1.5 text-xs shadow-md flex items-center gap-1.5 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 md:left-6 md:top-[72px]"
      >
        <Bookmark className="w-3.5 h-3.5" />
        {saveLocationLoading ? 'Saving...' : 'Save view'}
      </button>

      <div className="pointer-events-none absolute bottom-6 left-4 z-[1000] space-y-2 md:left-6">
        {!hasDefaultLocation && pinLoadState === 'ready' && (
          <div className="rounded-full border border-white/10 bg-slate-950/70 px-3 py-2 text-xs text-white/75 shadow-lg backdrop-blur-md">
            {isPinsOnlyOfflineMode ? 'Offline: showing saved pins only.' : 'Showing world view.'}
          </div>
        )}
        {pinLoadState === 'loading' && (
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-slate-950/70 px-3 py-2 text-xs text-white/75 shadow-lg backdrop-blur-md">
            <Loader2 className="size-3.5 animate-spin" />
            Loading crags...
          </div>
        )}
        {pinLoadState === 'error' && (
          <div className="rounded-full border border-amber-400/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-100 shadow-lg backdrop-blur-md">
            Couldn&apos;t load map pins. Header search still works.
          </div>
        )}
        {locationStatus === 'error' && (
          <div className="rounded-full border border-amber-400/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-100 shadow-lg backdrop-blur-md">
            Location unavailable. Search or move the map manually.
          </div>
        )}
      </div>

      {toast && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[1100] px-4 py-2 bg-green-600 text-white rounded-lg shadow-lg text-sm font-medium">
          {toast}
        </div>
      )}
    </div>
  )
}
