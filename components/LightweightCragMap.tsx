'use client'

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { useMapEvents } from 'react-leaflet'
import { uploadDebug } from '@/lib/media/upload-debug'
import type { LightweightCragMapPin } from '@/lib/lightweight-crag-map-types'
import { getMapBaseLayerConfig } from '@/lib/map/base-layer'
import { buildPinFeatures, isClusterFeature, type ClusterIndex, type ClusterResult } from '@/lib/map/place-pins'

import 'leaflet/dist/leaflet.css'

const MapContainer = dynamic(() => import('react-leaflet').then((mod) => mod.MapContainer), { ssr: false })
const TileLayer = dynamic(() => import('react-leaflet').then((mod) => mod.TileLayer), { ssr: false })
const Marker = dynamic(() => import('react-leaflet').then((mod) => mod.Marker), { ssr: false })
const ZoomControl = dynamic(() => import('react-leaflet').then((mod) => mod.ZoomControl), { ssr: false })

interface MapBounds {
  north: number
  south: number
  east: number
  west: number
}

interface ClusterMarkerPin {
  id: string
  latitude: number
  longitude: number
  label: string
  pointCount: number
  clusterId: number
}

interface ClusterClickTarget {
  clusterId: number
  latitude: number
  longitude: number
}

type RenderedMapItem =
  | { kind: 'cluster'; cluster: ClusterMarkerPin }
  | { kind: 'pin'; pin: LightweightCragMapPin }

function pinVisualStyles(active: boolean) {
  return {
    background: active ? '#d4a017' : '#ef4444',
    border: 'white',
    shadow: active ? '0 8px 22px rgba(212,160,23,0.38)' : '0 4px 12px rgba(15,23,42,0.22)',
    size: 24,
    fontSize: 11,
  }
}

function isPinActive(pin: LightweightCragMapPin, activePinId: string | null) {
  if (!activePinId) return false
  return pin.id === activePinId || pin.activeImageIds?.includes(activePinId) === true
}

function MapStateWatcher({ onStateChange }: { onStateChange: (state: { zoom: number; bounds: MapBounds }) => void }) {
  const map = useMapEvents({
    moveend: () => {
      const bounds = map.getBounds()
      onStateChange({
        zoom: map.getZoom(),
        bounds: {
          north: bounds.getNorth(),
          south: bounds.getSouth(),
          east: bounds.getEast(),
          west: bounds.getWest(),
        },
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
          west: bounds.getWest(),
        },
      })
    },
  })

  useEffect(() => {
    const bounds = map.getBounds()
    onStateChange({
      zoom: map.getZoom(),
      bounds: {
        north: bounds.getNorth(),
        south: bounds.getSouth(),
        east: bounds.getEast(),
        west: bounds.getWest(),
      },
    })
  }, [map, onStateChange])

  return null
}

interface MapPinMarkerProps {
  pin: LightweightCragMapPin
  index: number
  active: boolean
  leafletLib: typeof import('leaflet')
  onPinSelect?: (id: string) => void
}

const MapPinMarker = memo(function MapPinMarker({
  pin,
  index,
  active,
  leafletLib,
  onPinSelect,
}: MapPinMarkerProps) {
  useEffect(() => {
    uploadDebug('map-render-debug', { pinId: pin.id, isActive: active })
  }, [pin.id, active])

  const visual = pinVisualStyles(active)

  return (
    <Marker
      position={[pin.latitude, pin.longitude]}
      zIndexOffset={active ? 600 : 200}
      icon={leafletLib.divIcon({
        className: 'lightweight-crag-map-pin',
        html: `<div style="width:${visual.size}px;height:${visual.size}px;background:${visual.background};border-radius:9999px;display:flex;align-items:center;justify-content:center;color:white;font-size:${visual.fontSize}px;font-weight:700;border:2px solid ${visual.border};box-shadow:${visual.shadow};">${pin.label || index + 1}</div>`,
        iconSize: [visual.size, visual.size],
        iconAnchor: [12, 12],
      })}
      eventHandlers={onPinSelect && pin.interactive !== false ? { click: () => onPinSelect(pin.id) } : undefined}
    />
  )
}, (prev, next) => {
  return prev.pin.latitude === next.pin.latitude
    && prev.pin.longitude === next.pin.longitude
    && prev.active === next.active
    && prev.pin.label === next.pin.label
    && prev.pin.interactive === next.pin.interactive
    && prev.index === next.index
    && prev.onPinSelect === next.onPinSelect
})

interface ClusterMarkerProps {
  cluster: ClusterMarkerPin
  leafletLib: typeof import('leaflet')
  onSelect: (target: ClusterClickTarget) => void
}

const ClusterMarker = memo(function ClusterMarker({ cluster, leafletLib, onSelect }: ClusterMarkerProps) {
  return (
    <Marker
      position={[cluster.latitude, cluster.longitude]}
      zIndexOffset={500}
      icon={leafletLib.divIcon({
        className: 'crag-cluster-wrapper',
        html: `<div class="crag-cluster-pin">${cluster.pointCount}</div>`,
        iconSize: [36, 36],
        iconAnchor: [18, 18],
      })}
      eventHandlers={{ click: () => onSelect(cluster) }}
    />
  )
})

interface LightweightCragMapProps {
  pins?: LightweightCragMapPin[]
  draftPins?: LightweightCragMapPin[]
  publishedPins?: LightweightCragMapPin[]
  activePinId?: string | null
  initialCenter?: [number, number] | null
  onPinSelect?: (id: string) => void
  className?: string
  tileUrl?: string
  attribution?: string
  heightClassName?: string
}

export default function LightweightCragMap({
  pins = [],
  draftPins,
  publishedPins,
  activePinId = null,
  initialCenter = null,
  onPinSelect,
  className,
  tileUrl,
  attribution,
  heightClassName = 'min-h-[260px] md:min-h-[320px]',
}: LightweightCragMapProps) {
  const mapRef = useRef<import('leaflet').Map | null>(null)
  const [mapReady, setMapReady] = useState(false)
  const [leafletLib, setLeafletLib] = useState<typeof import('leaflet') | null>(null)
  const [minAllowedZoom, setMinAllowedZoom] = useState<number | null>(null)
  const [mapZoom, setMapZoom] = useState(15)
  const [mapBounds, setMapBounds] = useState<MapBounds | null>(null)
  const [clusterIndex, setClusterIndex] = useState<ClusterIndex | null>(null)
  const [isOffline, setIsOffline] = useState(false)

  const handleMapStateChange = useCallback((state: { zoom: number; bounds: MapBounds }) => {
    setMapZoom(state.zoom)
    setMapBounds(state.bounds)
  }, [])

  const resolvedPins = useMemo(() => {
    if (draftPins || publishedPins) {
      return [
        ...(publishedPins || []).map((pin) => ({ ...pin, interactive: pin.interactive ?? false, tone: pin.tone ?? 'published' as const })),
        ...(draftPins || []).map((pin) => ({ ...pin, interactive: pin.interactive ?? true, tone: pin.tone ?? 'draft' as const })),
      ]
    }

    return pins
  }, [draftPins, pins, publishedPins])

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

  const clusteredResults = useMemo<ClusterResult[]>(() => {
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

  const renderedPins = useMemo<RenderedMapItem[]>(() => {
    return clusteredResults.flatMap<RenderedMapItem>((feature, index) => {
      if (isClusterFeature(feature)) {
        return [{
          kind: 'cluster' as const,
          cluster: {
            id: `cluster-${feature.properties.cluster_id}`,
            latitude: feature.geometry.coordinates[1],
            longitude: feature.geometry.coordinates[0],
            label: String(feature.properties.point_count_abbreviated),
            pointCount: feature.properties.point_count,
            clusterId: feature.properties.cluster_id,
          },
        }]
      }

      const matchingPins = resolvedPins.filter((pin) => (
        Math.abs(pin.latitude - feature.geometry.coordinates[1]) < 0.000001
        && Math.abs(pin.longitude - feature.geometry.coordinates[0]) < 0.000001
      ))
      const representative = activePinId
        ? matchingPins.find((pin) => isPinActive(pin, activePinId)) || matchingPins[0]
        : matchingPins[0]

      if (!representative) return []

      return [{
        kind: 'pin' as const,
        pin: {
          ...representative,
          label: representative.label || String(index + 1),
          activeImageIds: Array.from(new Set(matchingPins.flatMap((pin) => pin.activeImageIds?.length ? pin.activeImageIds : [pin.id]))),
        },
      }]
    })
  }, [activePinId, clusteredResults, resolvedPins])

  const baseLayer = useMemo(() => {
    if (tileUrl) {
      return {
        imageryUrl: tileUrl,
        imageryAttribution: attribution || 'Tiles',
        labelsUrl: null,
        labelsAttribution: null,
        mode: 'satellite' as const,
      }
    }

    return getMapBaseLayerConfig({ offline: isOffline })
  }, [attribution, isOffline, tileUrl])

  const maxBounds = useMemo<import('leaflet').LatLngBoundsExpression | undefined>(() => {
    if (resolvedPins.length === 0 || !leafletLib) return undefined
    const bounds = leafletLib.latLngBounds(resolvedPins.map((pin) => [pin.latitude, pin.longitude] as [number, number]))
    return bounds.pad(0.15)
  }, [leafletLib, resolvedPins])

  const center = useMemo<[number, number]>(() => {
    if (initialCenter) return initialCenter
    if (resolvedPins.length === 0) return [0, 0]
    const latitude = resolvedPins.reduce((sum, pin) => sum + pin.latitude, 0) / resolvedPins.length
    const longitude = resolvedPins.reduce((sum, pin) => sum + pin.longitude, 0) / resolvedPins.length
    return [latitude, longitude]
  }, [initialCenter, resolvedPins])

  const handleClusterSelect = useCallback((target: ClusterClickTarget) => {
    if (!clusterIndex || !mapRef.current) return
    const expansionZoom = Math.min(clusterIndex.getClusterExpansionZoom(target.clusterId), 17)
    mapRef.current.setView([target.latitude, target.longitude], expansionZoom, { animate: true })
  }, [clusterIndex])

  useEffect(() => {
    if (typeof window === 'undefined') return

    void import('leaflet').then((leaflet) => {
      setLeafletLib(leaflet as typeof import('leaflet'))
    })
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
      const index = new SuperclusterLib({
        radius: 72,
        maxZoom: 16,
        minZoom: 0,
        minPoints: 2,
      }) as ClusterIndex

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
    uploadDebug('map-debug-state', {
      activePinId,
      resolvedPinsCount: resolvedPins.length,
      renderedPinsCount: renderedPins.length,
      hasActivePin: Boolean(activePinId && resolvedPins.some((pin) => isPinActive(pin, activePinId))),
    })
  }, [activePinId, renderedPins, resolvedPins])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !leafletLib || !mapReady || resolvedPins.length === 0) return

    const container = map.getContainer?.()
    if (!container || !container.isConnected) return

    const frameId = window.requestAnimationFrame(() => {
      const nextContainer = map.getContainer?.()
      if (!nextContainer || !nextContainer.isConnected) return

      map.invalidateSize()
      const bounds = leafletLib.latLngBounds(resolvedPins.map((pin) => [pin.latitude, pin.longitude] as [number, number]))
      map.fitBounds(bounds, { padding: [28, 28], maxZoom: 16, animate: false })
      const fittedZoom = map.getZoom()
      setMinAllowedZoom(Math.min(Math.max(13, fittedZoom - 1), 15))
    })

    return () => {
      window.cancelAnimationFrame(frameId)
    }
  }, [leafletLib, mapReady, resolvedPins])

  if (resolvedPins.length === 0) {
    return null
  }

  return (
    <div className={className}>
      <style jsx>{`
        :global(.lightweight-crag-map .leaflet-control-zoom) {
          margin-top: 10px;
          margin-right: 10px;
          border: 1px solid rgba(229, 231, 235, 0.9);
          box-shadow: 0 10px 25px rgba(15, 23, 42, 0.12);
          overflow: hidden;
          border-radius: 14px;
        }
        :global(.lightweight-crag-map .leaflet-control-zoom a) {
          width: 30px;
          height: 30px;
          line-height: 30px;
          background: rgba(255, 255, 255, 0.92);
          color: rgb(28, 25, 23);
        }
        :global(.lightweight-crag-map .leaflet-control-zoom a:hover) {
          background: rgba(245, 245, 244, 0.98);
        }
      `}</style>
      <div className={`lightweight-crag-map h-[260px] overflow-hidden rounded-[28px] border border-stone-200 bg-stone-100 shadow-sm md:h-[320px] dark:border-gray-800 dark:bg-gray-900 ${heightClassName}`}>
        {leafletLib ? (
          <MapContainer
            ref={mapRef as never}
            center={center}
            zoom={15}
            minZoom={Math.max(minAllowedZoom ?? 13, 13)}
            maxZoom={19}
            maxBounds={maxBounds}
            style={{ height: '100%', width: '100%' }}
            preferCanvas={true}
            scrollWheelZoom={true}
            doubleClickZoom={true}
            touchZoom={true}
            zoomControl={false}
            whenReady={() => setMapReady(true)}
          >
            <TileLayer url={baseLayer.imageryUrl} attribution={baseLayer.imageryAttribution} maxZoom={19} />
            {baseLayer.labelsUrl ? <TileLayer url={baseLayer.labelsUrl} attribution={baseLayer.labelsAttribution || undefined} maxZoom={19} /> : null}
            <ZoomControl position="topright" />
            <MapStateWatcher onStateChange={handleMapStateChange} />
            {mapReady ? renderedPins.map((item, index) => (
              item.kind === 'cluster'
                ? <ClusterMarker key={item.cluster.id} cluster={item.cluster} leafletLib={leafletLib} onSelect={handleClusterSelect} />
                : <MapPinMarker key={item.pin.id} pin={item.pin} index={index} active={isPinActive(item.pin, activePinId)} leafletLib={leafletLib} onPinSelect={onPinSelect} />
            )) : null}
          </MapContainer>
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <div className="animate-spin h-8 w-8 border-4 border-stone-400 border-t-transparent rounded-full" />
          </div>
        )}
      </div>
    </div>
  )
}
