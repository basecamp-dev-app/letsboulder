'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import dynamic from 'next/dynamic'
import L from 'leaflet'
import { Bookmark, Download, MapPin } from 'lucide-react'
import type { User } from '@supabase/supabase-js'

import { createClient } from '@/lib/supabase'
import { csrfFetch } from '@/hooks/useCsrf'
import { listOfflineCrags, removeCragDownload } from '@/lib/offline/crag-pack'
import type { OfflineCragMeta } from '@/lib/offline/types'

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

function DefaultLocationWatcher({
  defaultLocation,
  mapRef,
}: {
  defaultLocation: DefaultLocation | null
  mapRef: React.RefObject<L.Map | null>
}) {
  useEffect(() => {
    if (defaultLocation && mapRef.current) {
      mapRef.current.setView([defaultLocation.lat, defaultLocation.lng], defaultLocation.zoom)
    }
  }, [defaultLocation, mapRef])
  return null
}

interface CragMapItem {
  id: string
  name: string
  latitude: number
  longitude: number
}

function parseNumber(value: unknown): number | null {
  if (value == null) return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'string') {
    const n = parseFloat(value)
    return Number.isFinite(n) ? n : null
  }
  return null
}

function roundBboxKey(bbox: [number, number, number, number], zoom: number): string {
  const [west, south, east, north] = bbox
  const r = (n: number) => n.toFixed(3)
  return `${r(west)},${r(south)},${r(east)},${r(north)}@${Math.round(zoom)}`
}

interface CragPoint {
  id: string
  name: string
  latitude: number
  longitude: number
}

export default function SatelliteClimbingMap() {
  const mapRef = useRef<L.Map | null>(null)
  const [isClient, setIsClient] = useState(false)
  const [mapLoaded, setMapLoaded] = useState(false)

  const [userLocation, setUserLocation] = useState<[number, number] | null>(null)
  const [locationStatus, setLocationStatus] = useState<'idle' | 'requesting' | 'tracking' | 'error'>('idle')
  const [useUserLocation, setUseUserLocation] = useState(false)

  const [user, setUser] = useState<User | null>(null)
  const [defaultLocation, setDefaultLocation] = useState<{ lat: number; lng: number; zoom: number } | null>(null)
  const [defaultLocationLoading, setDefaultLocationLoading] = useState(true)
  const [saveLocationLoading, setSaveLocationLoading] = useState(false)
  const [isAtDefaultLocation, setIsAtDefaultLocation] = useState(true)

  const [items, setItems] = useState<CragMapItem[]>([])
  const [itemsLoading, setItemsLoading] = useState(false)
  const [tooManyItems, setTooManyItems] = useState(false)
  const [view, setView] = useState<{ bbox: [number, number, number, number]; zoom: number } | null>(null)

  const [toast, setToast] = useState<string | null>(null)
  const [downloadsOpen, setDownloadsOpen] = useState(false)
  const [offlineCrags, setOfflineCrags] = useState<OfflineCragMeta[]>([])
  const [offlineCragsLoading, setOfflineCragsLoading] = useState(false)
  const [isOffline, setIsOffline] = useState(false)

  const debounceTimerRef = useRef<number | null>(null)
  const lastFetchKeyRef = useRef<string | null>(null)
  const lastFetchAtRef = useRef<number>(0)
  const requestIdRef = useRef(0)

  const MAX_CRAGS = 2000
  const FETCH_TTL_MS = 15000
  const MIN_FETCH_ZOOM = 2

  useEffect(() => {
    setupLeafletIcons()
  }, [])

  useEffect(() => {
    setIsClient(true)
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const update = () => setIsOffline(!navigator.onLine)
    update()
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])

  useEffect(() => {
    if (toast) {
      const timer = window.setTimeout(() => setToast(null), 2000)
      return () => window.clearTimeout(timer)
    }
  }, [toast])

  const refreshOfflineCrags = useCallback(async () => {
    setOfflineCragsLoading(true)
    try {
      const metas = await listOfflineCrags()
      setOfflineCrags(metas)
    } catch {
      setOfflineCrags([])
    } finally {
      setOfflineCragsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!downloadsOpen) return
    refreshOfflineCrags()
  }, [downloadsOpen, refreshOfflineCrags])

  useEffect(() => {
    refreshOfflineCrags()
  }, [refreshOfflineCrags])

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
      if (ignore) return
      setUser(user)

      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('default_location_lat, default_location_lng, default_location_zoom')
          .eq('id', user.id)
          .single()

        if (ignore) return
        setDefaultLocationLoading(false)

        if (profile?.default_location_lat) {
          setDefaultLocation({
            lat: profile.default_location_lat,
            lng: profile.default_location_lng,
            zoom: profile.default_location_zoom || 12,
          })
        }
      } else {
        setDefaultLocationLoading(false)
      }
    }

    fetchUser()
    const handleFocus = () => {
      fetchUser()
    }
    window.addEventListener('focus', handleFocus)
    return () => {
      ignore = true
      window.removeEventListener('focus', handleFocus)
    }
  }, [isClient])

  const updateIsAtDefault = useCallback(() => {
    if (!mapRef.current || !defaultLocation) return
    const center = mapRef.current.getCenter()
    const distance = Math.sqrt(
      Math.pow(center.lat - defaultLocation.lat, 2) + Math.pow(center.lng - defaultLocation.lng, 2)
    )
    setIsAtDefaultLocation(distance < 0.01)
  }, [defaultLocation])

  useEffect(() => {
    if (!mapRef.current || !defaultLocation) return
    const map = mapRef.current
    const handleMoveEnd = () => updateIsAtDefault()
    map.on('moveend', handleMoveEnd)
    return () => {
      map.off('moveend', handleMoveEnd)
    }
  }, [defaultLocation, updateIsAtDefault])

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
          defaultLocationZoom: zoom,
        }),
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
    if (!mapRef.current || !mapLoaded) return

    if (useUserLocation && userLocation) {
      mapRef.current.setView(userLocation, 11)
      return
    }

    if (defaultLocation) {
      mapRef.current.setView([defaultLocation.lat, defaultLocation.lng], defaultLocation.zoom)
      return
    }

    mapRef.current.setView([20, 0], 2)
  }, [mapLoaded, defaultLocation, userLocation, useUserLocation])

  const fetchCragsForView = useCallback(
    async (bbox: [number, number, number, number], zoom: number, force = false) => {
      if (!isClient) return

      const key = roundBboxKey(bbox, zoom)
      const now = Date.now()
      if (!force && lastFetchKeyRef.current === key && now - lastFetchAtRef.current < FETCH_TTL_MS) {
        return
      }
      lastFetchKeyRef.current = key
      lastFetchAtRef.current = now

      const currentRequestId = ++requestIdRef.current
      setItemsLoading(true)
      setTooManyItems(false)
      setView({ bbox, zoom })

      if (zoom < MIN_FETCH_ZOOM) {
        setItems([])
        setItemsLoading(false)
        return
      }

      const [west, south, east, north] = bbox

      try {
        const supabase = createClient()

        const base = supabase
          .from('crags')
          .select('id, name, latitude, longitude')
          .not('latitude', 'is', null)
          .not('longitude', 'is', null)
          .gte('latitude', south)
          .lte('latitude', north)
          .limit(MAX_CRAGS)

        const queries =
          west <= east
            ? [base.gte('longitude', west).lte('longitude', east)]
            : [
                base.gte('longitude', west).lte('longitude', 180),
                base.gte('longitude', -180).lte('longitude', east),
              ]

        const results = await Promise.all(queries)
        if (requestIdRef.current !== currentRequestId) return

        const rows = results.flatMap((r) => r.data || []) as Array<{
          id: string
          name: string
          latitude: number | string | null
          longitude: number | string | null
        }>

        const uniq = new Map<string, CragPoint>()
        for (const row of rows) {
          const lat = parseNumber(row.latitude)
          const lng = parseNumber(row.longitude)
          if (lat == null || lng == null) continue
          uniq.set(row.id, { id: row.id, name: row.name, latitude: lat, longitude: lng })
        }

        const points = Array.from(uniq.values())
        setTooManyItems(points.length >= MAX_CRAGS)
        setItems(points)
      } catch (err) {
        if (requestIdRef.current !== currentRequestId) return
        console.error('Error loading crags for map:', err)
        setItems([])
        setTooManyItems(false)
      } finally {
        if (requestIdRef.current === currentRequestId) setItemsLoading(false)
      }
    },
    [FETCH_TTL_MS, MIN_FETCH_ZOOM, MAX_CRAGS, isClient]
  )

  const scheduleFetchForCurrentMap = useCallback(
    (force = false, debounce = true) => {
      if (!mapRef.current) return
      const map = mapRef.current
      const bounds = map.getBounds()
      const bbox: [number, number, number, number] = [
        bounds.getWest(),
        bounds.getSouth(),
        bounds.getEast(),
        bounds.getNorth(),
      ]
      const zoom = map.getZoom()

      setView({ bbox, zoom })

      if (!debounce) {
        if (debounceTimerRef.current) window.clearTimeout(debounceTimerRef.current)
        fetchCragsForView(bbox, zoom, force)
        return
      }

      if (debounceTimerRef.current) window.clearTimeout(debounceTimerRef.current)
      debounceTimerRef.current = window.setTimeout(() => {
        fetchCragsForView(bbox, zoom, force)
      }, 250)
    },
    [fetchCragsForView]
  )

  useEffect(() => {
    if (!mapRef.current || !mapLoaded) return
    const map = mapRef.current

    scheduleFetchForCurrentMap(true, false)

    const onMoveEnd = () => scheduleFetchForCurrentMap(false, true)
    const onZoomEnd = () => scheduleFetchForCurrentMap(true, false)

    map.on('moveend', onMoveEnd)
    map.on('zoomend', onZoomEnd)
    return () => {
      map.off('moveend', onMoveEnd)
      map.off('zoomend', onZoomEnd)
    }
  }, [mapLoaded, scheduleFetchForCurrentMap])

  useEffect(() => {
    if (!mapLoaded) return
    const handleFocus = () => scheduleFetchForCurrentMap(true, false)
    window.addEventListener('focus', handleFocus)
    return () => {
      window.removeEventListener('focus', handleFocus)
    }
  }, [mapLoaded, scheduleFetchForCurrentMap])

  const zoomHint = useMemo(() => {
    if (!view) return null
    if (itemsLoading) return null
    if (items.length > 0) return null
    return 'Pan or zoom to explore'
  }, [items.length, itemsLoading, view])

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
    <div className="h-screen w-full p-4 relative">
      <MapContainer
        ref={mapRef as RefObject<L.Map>}
        center={[20, 0]}
        zoom={2}
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
              iconAnchor: [6, 6],
            })}
          />
        )}

        {items.map((item) => {
          const lat = item.latitude
          const lng = item.longitude
          return (
            <Marker
              key={item.id}
              position={[lat, lng]}
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
                iconAnchor: [16, 16],
              })}
              zIndexOffset={1000}
              eventHandlers={{
                click: () => {
                  window.location.href = `/crag/${item.id}`
                },
              }}
            >
              <Tooltip direction="center" opacity={1}>
                <span className="font-semibold">{item.name}</span>
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

      <button
        onClick={() => setDownloadsOpen(true)}
        className="absolute left-4 top-[124px] z-[1100] bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md px-2 py-1.5 text-xs shadow-md flex items-center gap-1.5 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
      >
        <Download className="w-3.5 h-3.5" />
        Downloads
        {offlineCrags.length > 0 && (
          <span className="ml-1 px-1.5 py-0.5 rounded-full bg-gray-900 text-white text-[10px] tabular-nums">
            {offlineCrags.length}
          </span>
        )}
        {isOffline && <span className="ml-1 text-[10px] text-gray-500 dark:text-gray-400">offline</span>}
      </button>

      {locationStatus === 'requesting' && (
        <div className="absolute top-4 right-20 z-[1000] bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm">
          Requesting location...
        </div>
      )}

      {zoomHint && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[1100] bg-white/90 dark:bg-gray-900/90 border border-gray-200 dark:border-gray-800 rounded-full px-4 py-2 text-xs text-gray-800 dark:text-gray-100 shadow-md">
          {zoomHint}
        </div>
      )}

      {itemsLoading && (
        <div className="absolute bottom-4 left-4 z-[1100] bg-white/90 dark:bg-gray-900/90 border border-gray-200 dark:border-gray-800 rounded-full px-3 py-2 text-xs text-gray-700 dark:text-gray-200 shadow-md">
          Loading...
        </div>
      )}

      {tooManyItems && (
        <div className="absolute bottom-14 left-1/2 -translate-x-1/2 z-[1100] bg-yellow-100/95 dark:bg-yellow-900/40 border border-yellow-200 dark:border-yellow-900 rounded-full px-4 py-2 text-xs text-yellow-900 dark:text-yellow-100 shadow-md">
          Too many results here — zoom in to see all
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

      {!isAtDefaultLocation && user && defaultLocation && (
        <div className="absolute top-4 left-4 z-[1100] bg-white/90 dark:bg-gray-900/90 border border-gray-200 dark:border-gray-800 rounded-lg px-3 py-2 text-xs text-gray-800 dark:text-gray-100 shadow-md">
          You&apos;re viewing a different area
        </div>
      )}

      {toast && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[1100] px-4 py-2 bg-green-600 text-white rounded-lg shadow-lg text-sm font-medium">
          {toast}
        </div>
      )}

      {downloadsOpen && (
        <div className="fixed inset-0 z-[2000]">
          <div className="absolute inset-0 bg-black/40" onClick={() => setDownloadsOpen(false)} />
          <div className="absolute left-0 right-0 bottom-0 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 rounded-t-2xl shadow-2xl p-4 max-h-[72vh] overflow-auto">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">Offline downloads</div>
              <div className="flex items-center gap-2">
                <button
                  onClick={refreshOfflineCrags}
                  className="text-xs px-2 py-1 rounded-md bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700"
                >
                  Refresh
                </button>
                <button
                  onClick={() => setDownloadsOpen(false)}
                  className="text-xs px-2 py-1 rounded-md bg-gray-900 text-white hover:bg-gray-800"
                >
                  Close
                </button>
              </div>
            </div>

            <div className="mt-3">
              {offlineCragsLoading ? (
                <div className="text-sm text-gray-600 dark:text-gray-400">Loading…</div>
              ) : offlineCrags.length === 0 ? (
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  No crags downloaded yet. Open a crag and tap “Download offline”.
                </div>
              ) : (
                <div className="space-y-2">
                  {offlineCrags.map((c) => (
                    <div
                      key={c.cragId}
                      className="flex items-center justify-between bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2"
                    >
                      <div>
                        <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">{c.name}</div>
                        <div className="text-xs text-gray-600 dark:text-gray-400 tabular-nums">
                          Downloaded {new Date(c.downloadedAt).toLocaleDateString()}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            window.location.href = `/crag/${c.cragId}`
                          }}
                          className="text-xs px-3 py-1.5 rounded-md bg-blue-600 text-white hover:bg-blue-500"
                        >
                          Open
                        </button>
                        <button
                          onClick={async () => {
                            await removeCragDownload(c.cragId)
                            await refreshOfflineCrags()
                          }}
                          className="text-xs px-3 py-1.5 rounded-md bg-gray-900 text-white hover:bg-gray-800"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
