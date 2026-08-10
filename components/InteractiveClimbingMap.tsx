'use client'

import { startTransition, useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, X } from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'

import MapLibreVectorMap, { type MapLibreFitBounds } from '@/components/map/MapLibreVectorMap'
import type { BrowserLocationPoint } from '@/hooks/use-browser-geolocation'
import { reportError } from '@/lib/errors'
import { normalizePaddedViewport, type MapBounds, type MapViewportQuery } from '@/lib/map/map-bounds'
import { mapPinsQueryOptions } from '@/lib/map/map-pins-query'
import { buildPinFeatures, type PinFeature, type PlacePin, type ViewportPinCluster, type ViewportPlacePin } from '@/lib/map/place-pins'

const WORLD_DEFAULT_CENTER: [number, number] = [0, 20]
const WORLD_DEFAULT_ZOOM = 2
const WORLD_VIEWPORT = normalizePaddedViewport({ west: -180, south: -85, east: 180, north: 85 }, WORLD_DEFAULT_ZOOM)

function buildPlaceHref(place: Pick<PlacePin, 'id' | 'slug' | 'country_code' | 'type'>) {
  if (place.type === 'gym') return null
  if (place.slug && place.country_code) return `/${place.country_code.toLowerCase()}/${place.slug}`
  return `/crag/${place.id}`
}

function navigateToPlace(router: ReturnType<typeof useRouter>, href: string) {
  startTransition(() => {
    router.push(href)
  })
}

function formatCount(count: number | null, singular: string, plural: string) {
  if (!count) return null
  return `${count} ${count === 1 ? singular : plural}`
}

function buildFitBounds(features: PinFeature[]): MapLibreFitBounds | null {
  if (features.length === 0) return null

  const longitudes = features.map((feature) => feature.geometry.coordinates[0])
  const latitudes = features.map((feature) => feature.geometry.coordinates[1])
  return [
    [Math.min(...longitudes), Math.min(...latitudes)],
    [Math.max(...longitudes), Math.max(...latitudes)],
  ]
}

export default function InteractiveClimbingMap({
  initialPlacePins = [],
  onReady,
  userLocation = null,
}: {
  initialPlacePins?: PlacePin[]
  onReady?: () => void
  userLocation?: BrowserLocationPoint | null
}) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [mapLoaded, setMapLoaded] = useState(false)
  const [isOffline, setIsOffline] = useState(false)
  const [viewport, setViewport] = useState<MapViewportQuery | null>(null)
  const [selectedPlace, setSelectedPlace] = useState<PlacePin | null>(null)
  const [clusterFocus, setClusterFocus] = useState<{ center: [number, number]; zoom: number } | null>(null)

  const pinsQuery = useQuery({
    ...mapPinsQueryOptions(viewport ?? WORLD_VIEWPORT),
    enabled: mapLoaded && viewport !== null && !isOffline,
  })
  const onlineFeatures = pinsQuery.data?.features
  const { placePins, clusters } = useMemo(() => {
    if (!onlineFeatures) return { placePins: initialPlacePins, clusters: [] as ViewportPinCluster[] }
    return {
      placePins: onlineFeatures.filter((feature): feature is ViewportPlacePin => !feature.is_cluster),
      clusters: onlineFeatures.filter((feature): feature is ViewportPinCluster => feature.is_cluster),
    }
  }, [initialPlacePins, onlineFeatures])
  const selectedPlaceId = selectedPlace?.id ?? null

  const pinFeatures = useMemo<PinFeature[]>(() => buildPinFeatures(placePins), [placePins])
  const offlineFitBounds = useMemo(() => isOffline ? buildFitBounds(pinFeatures) : null, [isOffline, pinFeatures])
  const userFitBounds = useMemo<MapLibreFitBounds | null>(() => userLocation
    ? [[userLocation.longitude, userLocation.latitude], [userLocation.longitude, userLocation.latitude]]
    : null, [userLocation])

  const handleMapStateChange = useCallback((state: { zoom: number; bounds: MapBounds }) => {
    void queryClient.cancelQueries({ queryKey: ['map-pins'] })
    setViewport(normalizePaddedViewport(state.bounds, state.zoom))
  }, [queryClient])

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

  const placesById = useMemo(() => new Map(placePins.map((place) => [place.id, place])), [placePins])
  const accessiblePlaceLimit = clusters.length > 0 ? 10 : 20
  const accessibleClusterLimit = 20 - Math.min(placePins.length, accessiblePlaceLimit)
  const selectedPlaceHref = selectedPlace ? buildPlaceHref(selectedPlace) : null
  const pinsGeoJson = useMemo<GeoJSON.FeatureCollection<GeoJSON.Point>>(() => ({
    type: 'FeatureCollection',
    features: pinFeatures.map((feature) => {
      const place = feature.properties
      return {
        type: 'Feature' as const,
        geometry: feature.geometry,
        properties: {
          id: place.id,
          selectId: place.id,
          label: '',
          active: place.id === selectedPlaceId,
          placeType: place.type,
          interactive: true,
        },
      }
    }),
  }), [pinFeatures, selectedPlaceId])

  const clustersGeoJson = useMemo<GeoJSON.FeatureCollection<GeoJSON.Point>>(() => ({
    type: 'FeatureCollection',
    features: clusters.map((cluster) => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [cluster.longitude, cluster.latitude] },
        properties: {
          clusterId: cluster.id,
          pointCount: cluster.point_count,
          expansionZoom: Math.min((viewport?.zoom ?? WORLD_DEFAULT_ZOOM) + 1, 17),
        },
      })),
  }), [clusters, viewport?.zoom])

  useEffect(() => {
    if (!pinsQuery.error) return
    reportError(pinsQuery.error, { message: 'Error loading viewport map pins' })
  }, [pinsQuery.error])

  return (
    <div className="relative h-full min-h-full w-full">
      {isOffline ? <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(71,85,105,0.32),_transparent_48%),linear-gradient(180deg,_#020617_0%,_#0f172a_100%)]" /> : null}
      <MapLibreVectorMap
        center={WORLD_DEFAULT_CENTER}
        zoom={WORLD_DEFAULT_ZOOM}
        minZoom={2}
        maxZoom={19}
        aria-label="Climbing locations map"
        fitBounds={userFitBounds ?? offlineFitBounds}
        focusTarget={clusterFocus}
        pinsGeoJson={pinsGeoJson}
        clustersGeoJson={clustersGeoJson}
        userLocation={userLocation}
        offline={isOffline}
        className="h-full w-full"
        onReady={() => {
          setMapLoaded(true)
          onReady?.()
        }}
        onViewportChange={handleMapStateChange}
        onPinSelect={(id) => {
          const place = placesById.get(id)
          if (place) setSelectedPlace(place)
        }}
      />
      <aside aria-label="Climbing locations" className="sr-only focus-within:not-sr-only focus-within:absolute focus-within:left-4 focus-within:top-20 focus-within:z-[1001] focus-within:max-h-[calc(100%-6rem)] focus-within:w-72 focus-within:overflow-y-auto focus-within:rounded-2xl focus-within:bg-white/95 focus-within:p-2 focus-within:shadow-2xl focus-within:backdrop-blur-md">
        <ul className="space-y-1">
          {placePins.slice(0, accessiblePlaceLimit).map((place) => (
            <li key={place.id}>
              <button
                type="button"
                onClick={() => setSelectedPlace(place)}
                aria-pressed={place.id === selectedPlaceId}
                className="w-full rounded-xl px-3 py-2 text-left text-sm font-semibold text-stone-800 outline-none hover:bg-stone-100 focus-visible:ring-2 focus-visible:ring-amber-500 aria-pressed:bg-amber-100 aria-pressed:text-amber-950"
              >
                {place.name}, {place.type === 'gym' ? 'gym' : 'crag'}
              </button>
            </li>
          ))}
          {clusters.slice(0, accessibleClusterLimit).map((cluster) => (
            <li key={cluster.id}>
              <button
                type="button"
                onClick={() => setClusterFocus({
                  center: [cluster.longitude, cluster.latitude],
                  zoom: Math.min((viewport?.zoom ?? WORLD_DEFAULT_ZOOM) + 1, 17),
                })}
                className="w-full rounded-xl px-3 py-2 text-left text-sm font-semibold text-stone-800 outline-none hover:bg-stone-100 focus-visible:ring-2 focus-visible:ring-amber-500"
              >
                Explore cluster of {cluster.point_count} locations near {cluster.latitude.toFixed(2)}, {cluster.longitude.toFixed(2)}
              </button>
            </li>
          ))}
        </ul>
      </aside>
      {selectedPlace ? (
        <div className="absolute inset-x-4 bottom-[calc(var(--app-mobile-footer-offset,0px)+1rem)] z-[1001] md:inset-x-auto md:bottom-6 md:left-6 md:w-[22rem]">
          <div className="overflow-hidden rounded-3xl border border-white/70 bg-white/95 text-stone-950 shadow-2xl shadow-slate-950/20 backdrop-blur-md dark:border-white/10 dark:bg-slate-950/92 dark:text-white">
            <div className="flex items-start justify-between gap-3 px-4 pt-4">
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-700 dark:text-amber-300">
                  {selectedPlace.type === 'gym' ? 'Gym' : 'Crag'}{selectedPlace.country_code ? ` · ${selectedPlace.country_code.toUpperCase()}` : ''}
                </p>
                <h2 className="mt-1 truncate text-lg font-black tracking-tight">{selectedPlace.name}</h2>
              </div>
              <button
                type="button"
                onClick={() => setSelectedPlace(null)}
                className="rounded-full border border-stone-200 bg-white p-2 text-stone-500 shadow-sm transition hover:bg-stone-100 hover:text-stone-900 dark:border-white/10 dark:bg-white/10 dark:text-white/70 dark:hover:bg-white/15 dark:hover:text-white"
                aria-label="Close selected place"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="px-4 pb-4 pt-3">
              <div className="mb-4 flex flex-wrap gap-2 text-xs font-semibold text-stone-600 dark:text-white/65">
                {[formatCount(selectedPlace.route_count, 'route', 'routes'), formatCount(selectedPlace.image_count, 'image', 'images')]
                  .filter((label): label is string => Boolean(label))
                  .map((label) => (
                    <span key={label} className="rounded-full bg-stone-100 px-2.5 py-1 dark:bg-white/10">{label}</span>
                  ))}
              </div>
              {selectedPlaceHref ? (
                <button
                  type="button"
                  onClick={() => navigateToPlace(router, selectedPlaceHref)}
                  className="w-full rounded-2xl bg-stone-950 px-4 py-3 text-sm font-black text-white shadow-sm transition hover:bg-stone-800 dark:bg-amber-300 dark:text-slate-950 dark:hover:bg-amber-200"
                >
                  View crag
                </button>
              ) : (
                <p className="rounded-2xl bg-stone-100 px-4 py-3 text-sm font-semibold text-stone-700 dark:bg-white/10 dark:text-white/75">
                  Gym guides are coming soon.
                </p>
              )}
            </div>
          </div>
        </div>
      ) : null}
      <div className="pointer-events-none absolute bottom-6 left-4 z-[1000] space-y-2 md:left-6">
        {isOffline ? (
          <div role="status" className="rounded-full border border-white/10 bg-slate-950/70 px-3 py-2 text-xs text-white/75 shadow-lg backdrop-blur-md">
            Connection lost. Map updates are unavailable.
          </div>
        ) : null}
        {!isOffline && pinsQuery.isFetching ? (
          <div role="status" className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-slate-950/70 px-3 py-2 text-xs text-white/75 shadow-lg backdrop-blur-md">
            <Loader2 className="size-3.5 animate-spin" />
            Loading crags...
          </div>
        ) : null}
        {!isOffline && pinsQuery.isError ? (
          <div role="alert" className="rounded-full border border-amber-400/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-100 shadow-lg backdrop-blur-md">
            Couldn&apos;t load map pins. Header search still works.
          </div>
        ) : null}
      </div>
    </div>
  )
}
