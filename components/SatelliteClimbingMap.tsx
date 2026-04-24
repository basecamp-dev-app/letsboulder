'use client'

import { startTransition, useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'

import MapLibreVectorMap, { type MapBounds, type MapLibreFitBounds } from '@/components/map/MapLibreVectorMap'
import { reportError } from '@/lib/errors'
import { buildPinFeatures, isClusterFeature, type ClusterIndex, type ClusterResult, type PinFeature, type PlacePin } from '@/lib/map/place-pins'
import { runWhenIdle } from '@/lib/run-when-idle'

const WORLD_DEFAULT_CENTER: [number, number] = [0, 20]
const WORLD_DEFAULT_ZOOM = 2

function buildPlaceHref(place: Pick<PlacePin, 'id' | 'slug' | 'country_code' | 'type'>) {
  if (place.type === 'gym' && place.slug) return `/gyms/${place.slug}`
  if (place.slug && place.country_code) return `/${place.country_code.toLowerCase()}/${place.slug}`
  return `/crag/${place.id}`
}

function navigateToPlace(router: ReturnType<typeof useRouter>, place: Pick<PlacePin, 'id' | 'slug' | 'country_code' | 'type'>) {
  startTransition(() => {
    router.push(buildPlaceHref(place))
  })
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

export default function SatelliteClimbingMap({
  initialPlacePins = [],
  onReady,
}: {
  initialPlacePins?: PlacePin[]
  onReady?: () => void
}) {
  const router = useRouter()
  const [isClient, setIsClient] = useState(false)
  const [mapLoaded, setMapLoaded] = useState(false)
  const [placePins, setPlacePins] = useState<PlacePin[]>(initialPlacePins)
  const [pinLoadState, setPinLoadState] = useState<'idle' | 'loading' | 'ready' | 'error'>(initialPlacePins.length > 0 ? 'ready' : 'idle')
  const [mapZoom, setMapZoom] = useState(WORLD_DEFAULT_ZOOM)
  const [mapBounds, setMapBounds] = useState<MapBounds | null>(null)
  const [clusterIndex, setClusterIndex] = useState<ClusterIndex | null>(null)
  const [isOffline, setIsOffline] = useState(false)

  const pinFeatures = useMemo<PinFeature[]>(() => buildPinFeatures(placePins), [placePins])
  const offlineFitBounds = useMemo(() => isOffline ? buildFitBounds(pinFeatures) : null, [isOffline, pinFeatures])

  const loadPlacePins = useCallback(async () => {
    if (!isClient || initialPlacePins.length > 0) {
      if (initialPlacePins.length > 0) setPinLoadState('ready')
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

  const handleMapStateChange = useCallback((state: { zoom: number; bounds: MapBounds }) => {
    setMapZoom(state.zoom)
    setMapBounds(state.bounds)
  }, [])

  useEffect(() => {
    setIsClient(true)
  }, [])

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
      const index = new SuperclusterLib({ radius: 56, maxZoom: 16, minZoom: 0, minPoints: 2 }) as ClusterIndex
      index.load(pinFeatures)
      setClusterIndex(index)
    }).catch(() => {
      if (!cancelled) setClusterIndex(null)
    })

    return () => {
      cancelled = true
    }
  }, [pinFeatures])

  useEffect(() => {
    if (!isClient || !mapLoaded) return
    return runWhenIdle(() => {
      void loadPlacePins()
    }, 150)
  }, [isClient, loadPlacePins, mapLoaded])

  const clusteredPlaces = useMemo<ClusterResult[]>(() => {
    if (pinFeatures.length === 0 || !clusterIndex) return pinFeatures

    const zoom = Math.max(0, Math.floor(mapZoom))
    const worldBounds: [number, number, number, number] = [-180, -85, 180, 85]

    if (!mapBounds) return clusterIndex.getClusters(worldBounds, zoom) as ClusterResult[]

    const north = Math.min(85, mapBounds.north)
    const south = Math.max(-85, mapBounds.south)

    if (mapBounds.west <= mapBounds.east) {
      return clusterIndex.getClusters([mapBounds.west, south, mapBounds.east, north], zoom) as ClusterResult[]
    }

    const westClusters = clusterIndex.getClusters([mapBounds.west, south, 180, north], zoom) as ClusterResult[]
    const eastClusters = clusterIndex.getClusters([-180, south, mapBounds.east, north], zoom) as ClusterResult[]
    return [...westClusters, ...eastClusters]
  }, [clusterIndex, mapBounds, mapZoom, pinFeatures])

  const pinsGeoJson = useMemo<GeoJSON.FeatureCollection<GeoJSON.Point>>(() => ({
    type: 'FeatureCollection',
    features: clusteredPlaces.flatMap((feature) => {
      if (isClusterFeature(feature)) return []
      const place = feature.properties
      return [{
        type: 'Feature' as const,
        geometry: feature.geometry,
        properties: {
          id: place.id,
          selectId: place.id,
          label: '',
          placeType: place.type,
          interactive: true,
        },
      }]
    }),
  }), [clusteredPlaces])

  const clustersGeoJson = useMemo<GeoJSON.FeatureCollection<GeoJSON.Point>>(() => ({
    type: 'FeatureCollection',
    features: clusteredPlaces.flatMap((feature) => {
      if (!isClusterFeature(feature)) return []
      return [{
        type: 'Feature' as const,
        geometry: feature.geometry,
        properties: {
          clusterId: feature.properties.cluster_id,
          pointCount: feature.properties.point_count,
          expansionZoom: clusterIndex ? Math.min(clusterIndex.getClusterExpansionZoom(feature.properties.cluster_id), 17) : 17,
        },
      }]
    }),
  }), [clusterIndex, clusteredPlaces])

  const placesById = useMemo(() => new Map(placePins.map((place) => [place.id, place])), [placePins])

  return (
    <div className="relative h-screen w-full">
      {isOffline ? <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(71,85,105,0.32),_transparent_48%),linear-gradient(180deg,_#020617_0%,_#0f172a_100%)]" /> : null}
      <MapLibreVectorMap
        center={WORLD_DEFAULT_CENTER}
        zoom={WORLD_DEFAULT_ZOOM}
        minZoom={2}
        maxZoom={19}
        fitBounds={offlineFitBounds}
        pinsGeoJson={pinsGeoJson}
        clustersGeoJson={clustersGeoJson}
        offline={isOffline}
        className="h-full w-full"
        onReady={() => {
          setMapLoaded(true)
          onReady?.()
        }}
        onViewportChange={handleMapStateChange}
        onPinSelect={(id) => {
          const place = placesById.get(id)
          if (place) navigateToPlace(router, place)
        }}
      />
      <div className="pointer-events-none absolute bottom-6 left-4 z-[1000] space-y-2 md:left-6">
        {isOffline && pinLoadState === 'ready' ? (
          <div className="rounded-full border border-white/10 bg-slate-950/70 px-3 py-2 text-xs text-white/75 shadow-lg backdrop-blur-md">
            Offline: showing saved pins only.
          </div>
        ) : null}
        {pinLoadState === 'loading' ? (
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-slate-950/70 px-3 py-2 text-xs text-white/75 shadow-lg backdrop-blur-md">
            <Loader2 className="size-3.5 animate-spin" />
            Loading crags...
          </div>
        ) : null}
        {pinLoadState === 'error' ? (
          <div className="rounded-full border border-amber-400/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-100 shadow-lg backdrop-blur-md">
            Couldn&apos;t load map pins. Header search still works.
          </div>
        ) : null}
      </div>
    </div>
  )
}
