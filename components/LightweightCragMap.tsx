'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import MapLibreVectorMap, { type MapBounds, type MapLibreFitBounds } from '@/components/map/MapLibreVectorMap'
import type { LightweightCragMapPin } from '@/lib/lightweight-crag-map-types'
import { buildPinFeatures, isClusterFeature, type ClusterIndex, type ClusterResult } from '@/lib/map/place-pins'

function getPinCoordinateKey(latitude: number, longitude: number) {
  return `${latitude.toFixed(6)}:${longitude.toFixed(6)}`
}

function mapBoundsEqual(left: MapBounds | null, right: MapBounds | null) {
  if (left === right) return true
  if (!left || !right) return false

  return left.north === right.north
    && left.south === right.south
    && left.east === right.east
    && left.west === right.west
}

function isPinActive(pin: LightweightCragMapPin, activePinId: string | null) {
  if (!activePinId) return false
  return pin.id === activePinId || pin.activeImageIds?.includes(activePinId) === true
}

function buildFitBounds(pins: LightweightCragMapPin[]): MapLibreFitBounds | null {
  if (pins.length === 0) return null

  const longitudes = pins.map((pin) => pin.longitude)
  const latitudes = pins.map((pin) => pin.latitude)
  return [
    [Math.min(...longitudes), Math.min(...latitudes)],
    [Math.max(...longitudes), Math.max(...latitudes)],
  ]
}

interface LightweightCragMapProps {
  pins?: LightweightCragMapPin[]
  draftPins?: LightweightCragMapPin[]
  publishedPins?: LightweightCragMapPin[]
  activePinId?: string | null
  initialCenter?: [number, number] | null
  initialZoom?: number
  onPinSelect?: (id: string) => void
  interactiveViewport?: boolean
  staticPreview?: boolean
  disableClustering?: boolean
  disableAutoFit?: boolean
  onViewportChange?: (state: { zoom: number; bounds: MapBounds }) => void
  className?: string
  heightMode?: 'intrinsic' | 'fill'
  heightClassName?: string
}

export default function LightweightCragMap({
  pins = [],
  draftPins,
  publishedPins,
  activePinId = null,
  initialCenter = null,
  initialZoom = 15,
  onPinSelect,
  interactiveViewport = true,
  staticPreview = false,
  disableClustering = false,
  disableAutoFit = false,
  onViewportChange,
  className,
  heightMode = 'intrinsic',
  heightClassName,
}: LightweightCragMapProps) {
  const [mapReady, setMapReady] = useState(false)
  const [mapZoom, setMapZoom] = useState(initialZoom)
  const [mapBounds, setMapBounds] = useState<MapBounds | null>(null)
  const [clusterIndex, setClusterIndex] = useState<ClusterIndex | null>(null)
  const [isOffline, setIsOffline] = useState(false)
  const lastMapStateRef = useRef<{ zoom: number; bounds: MapBounds } | null>(null)

  const resolvedPins = useMemo(() => {
    if (draftPins || publishedPins) {
      return [
        ...(publishedPins || []).map((pin) => ({ ...pin, interactive: pin.interactive ?? false, tone: pin.tone ?? 'published' as const })),
        ...(draftPins || []).map((pin) => ({ ...pin, interactive: pin.interactive ?? true, tone: pin.tone ?? 'draft' as const })),
      ]
    }

    return pins
  }, [draftPins, pins, publishedPins])

  const usesStaticPreview = staticPreview
  const fitBounds = useMemo(() => disableAutoFit ? null : buildFitBounds(resolvedPins), [disableAutoFit, resolvedPins])

  const center = useMemo<[number, number]>(() => {
    if (initialCenter) return [initialCenter[1], initialCenter[0]]
    if (resolvedPins.length === 0) return [0, 0]
    const latitude = resolvedPins.reduce((sum, pin) => sum + pin.latitude, 0) / resolvedPins.length
    const longitude = resolvedPins.reduce((sum, pin) => sum + pin.longitude, 0) / resolvedPins.length
    return [longitude, latitude]
  }, [initialCenter, resolvedPins])

  const pinFeatures = useMemo(() => buildPinFeatures(resolvedPins.map((pin) => ({
    id: pin.id,
    name: pin.label || pin.id,
    type: 'crag' as const,
    latitude: pin.latitude,
    longitude: pin.longitude,
    slug: null,
    country_code: null,
    image_count: null,
    route_count: null,
  }))), [resolvedPins])

  const pinsByCoordinateKey = useMemo(() => {
    const nextPinsByCoordinateKey = new Map<string, LightweightCragMapPin[]>()

    for (const pin of resolvedPins) {
      const coordinateKey = getPinCoordinateKey(pin.latitude, pin.longitude)
      const matchingPins = nextPinsByCoordinateKey.get(coordinateKey)
      if (matchingPins) {
        matchingPins.push(pin)
        continue
      }
      nextPinsByCoordinateKey.set(coordinateKey, [pin])
    }

    return nextPinsByCoordinateKey
  }, [resolvedPins])

  const clusteredResults = useMemo<ClusterResult[]>(() => {
    if (usesStaticPreview || disableClustering || !interactiveViewport) return pinFeatures
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
  }, [clusterIndex, disableClustering, interactiveViewport, mapBounds, mapZoom, pinFeatures, usesStaticPreview])

  const pinsGeoJson = useMemo<GeoJSON.FeatureCollection<GeoJSON.Point>>(() => ({
    type: 'FeatureCollection',
    features: clusteredResults.flatMap((feature, index) => {
      if (isClusterFeature(feature)) return []

      const matchingPins = pinsByCoordinateKey.get(getPinCoordinateKey(feature.geometry.coordinates[1], feature.geometry.coordinates[0])) || []
      const representative = activePinId
        ? matchingPins.find((pin) => isPinActive(pin, activePinId)) || matchingPins[0]
        : matchingPins[0]

      if (!representative) return []
      const activeImageIds = Array.from(new Set(matchingPins.flatMap((pin) => pin.activeImageIds?.length ? pin.activeImageIds : [pin.id])))
      const active = isPinActive({ ...representative, activeImageIds }, activePinId)

      return [{
        type: 'Feature' as const,
        geometry: feature.geometry,
        properties: {
          id: representative.id,
          selectId: representative.primaryImageId || representative.id,
          label: representative.label || String(index + 1),
          active,
          interactive: representative.interactive !== false,
          tone: representative.tone || 'draft',
        },
      }]
    }),
  }), [activePinId, clusteredResults, pinsByCoordinateKey])

  const clustersGeoJson = useMemo<GeoJSON.FeatureCollection<GeoJSON.Point>>(() => ({
    type: 'FeatureCollection',
    features: clusteredResults.flatMap((feature) => {
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
  }), [clusterIndex, clusteredResults])

  const interactivePins = useMemo(() => resolvedPins.filter((pin) => pin.interactive !== false), [resolvedPins])

  const handleMapStateChange = useCallback((state: { zoom: number; bounds: MapBounds }) => {
    const previousState = lastMapStateRef.current
    if (previousState && previousState.zoom === state.zoom && mapBoundsEqual(previousState.bounds, state.bounds)) return

    lastMapStateRef.current = state
    setMapZoom((currentZoom) => currentZoom === state.zoom ? currentZoom : state.zoom)
    setMapBounds((currentBounds) => mapBoundsEqual(currentBounds, state.bounds) ? currentBounds : state.bounds)
    onViewportChange?.(state)
  }, [onViewportChange])

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
    if (!interactiveViewport || usesStaticPreview || disableClustering) return
    let cancelled = false

    if (pinFeatures.length === 0) {
      setClusterIndex(null)
      return
    }

    void import('supercluster').then((mod) => {
      if (cancelled) return

      const SuperclusterLib = mod.default
      const index = new SuperclusterLib({ radius: 72, maxZoom: 16, minZoom: 0, minPoints: 2 }) as ClusterIndex
      index.load(pinFeatures)
      setClusterIndex(index)
    }).catch(() => {
      if (!cancelled) setClusterIndex(null)
    })

    return () => {
      cancelled = true
    }
  }, [disableClustering, interactiveViewport, pinFeatures, usesStaticPreview])

  if (resolvedPins.length === 0) return null

  const isFillHeight = heightMode === 'fill'
  const outerWrapperClasses = isFillHeight ? 'h-full min-h-0' : ''
  const heightClasses = isFillHeight
    ? `h-full min-h-0 ${heightClassName || ''}`.trim()
    : `${heightClassName || 'h-[260px] md:h-[320px]'}`.trim()

  return (
    <div className={[className, outerWrapperClasses].filter(Boolean).join(' ')}>
      <div className={`lightweight-crag-map relative overflow-hidden rounded-[28px] border border-stone-200 bg-stone-100 shadow-sm dark:border-gray-800 dark:bg-gray-900 ${heightClasses}`}>
        <MapLibreVectorMap
          center={center}
          zoom={initialZoom}
          minZoom={usesStaticPreview ? initialZoom : 13}
          maxZoom={19}
          fitBounds={usesStaticPreview ? null : fitBounds}
          pinsGeoJson={pinsGeoJson}
          clustersGeoJson={clustersGeoJson}
          interactive={interactiveViewport}
          staticPreview={usesStaticPreview}
          offline={isOffline}
          className="h-full w-full"
          onReady={() => setMapReady(true)}
          onViewportChange={interactiveViewport && !usesStaticPreview ? handleMapStateChange : undefined}
          onPinSelect={onPinSelect}
        />
        {!mapReady ? (
          <div className="absolute inset-0 flex h-full w-full items-center justify-center bg-stone-100/90 dark:bg-gray-900/90" data-testid="map-loading-state">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-stone-400 border-t-transparent" />
          </div>
        ) : null}
        {isOffline ? (
          <div className="pointer-events-none absolute bottom-3 left-3 rounded-full border border-white/10 bg-slate-950/70 px-3 py-1.5 text-xs text-white/75 shadow-lg backdrop-blur-md">
            Offline: showing pins only.
          </div>
        ) : null}
      </div>
      {onPinSelect && interactivePins.length > 0 ? (
        <section className="mt-3 rounded-[24px] border border-stone-200 bg-white p-3 shadow-sm dark:border-gray-800 dark:bg-gray-900" aria-label="Map markers">
          <h2 className="sr-only">Map markers</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {interactivePins.map((pin, index) => {
              const selectId = pin.primaryImageId || pin.id
              const active = isPinActive(pin, activePinId) || selectId === activePinId
              const label = pin.label || String(index + 1)
              return (
                <button
                  key={`${pin.id}-${selectId}`}
                  type="button"
                  onClick={() => onPinSelect(selectId)}
                  aria-pressed={active}
                  className={`min-h-11 rounded-2xl border px-3 py-2 text-left text-sm transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500 ${active ? 'border-amber-400 bg-amber-50 text-stone-950 dark:border-amber-300 dark:bg-amber-300/15 dark:text-white' : 'border-stone-200 bg-stone-50 text-stone-800 hover:bg-stone-100 dark:border-white/10 dark:bg-white/5 dark:text-gray-100 dark:hover:bg-white/10'}`}
                >
                  <span className="block font-semibold">Select marker {label}</span>
                  <span className="mt-0.5 block text-xs text-stone-600 dark:text-gray-400">
                    {pin.tone === 'published' ? 'Published route image' : 'Route image'}
                  </span>
                </button>
              )
            })}
          </div>
        </section>
      ) : null}
    </div>
  )
}
