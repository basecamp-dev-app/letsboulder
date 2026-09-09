'use client'

import { useEffect, useMemo, useRef } from 'react'
import * as maplibregl from 'maplibre-gl'
import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl'

import type { MapBounds } from '@/lib/map/map-bounds'
import { buildMapLibreStyle } from '@/lib/map/maplibre-style'
import { classifyMapFailure, type MapFailure } from '@/lib/map/map-failure'
import { getVectorMapConfig } from '@/lib/map/vector-map-config'

export type { MapBounds } from '@/lib/map/map-bounds'

export type MapLibreLngLat = [number, number]
export type MapLibreFitBounds = [MapLibreLngLat, MapLibreLngLat]

export interface MapLibreClusterSelection {
  bounds: MapLibreFitBounds
  queryZoom: number
}

interface LocationPoint {
  latitude: number
  longitude: number
}

interface MapLibreVectorMapProps {
  'aria-label'?: string
  center: MapLibreLngLat
  zoom: number
  minZoom?: number
  maxZoom?: number
  fitBounds?: MapLibreFitBounds | null
  focusBounds?: MapLibreFitBounds | null
  pinsGeoJson: GeoJSON.FeatureCollection<GeoJSON.Point>
  clustersGeoJson?: GeoJSON.FeatureCollection<GeoJSON.Point>
  userLocation?: LocationPoint | null
  activePinId?: string | null
  interactive?: boolean
  staticPreview?: boolean
  offline?: boolean
  className?: string
  onReady?: () => void
  onViewportChange?: (state: { zoom: number; bounds: MapBounds }) => void
  onPinSelect?: (id: string) => void
  onClusterSelect?: (selection: MapLibreClusterSelection) => void
  onFailure?: (failure: MapFailure) => void
  focusOnReady?: boolean
}

function getSource(map: MapLibreMap, sourceId: string) {
  return map.getSource(sourceId) as GeoJSONSource | undefined
}

function getBoundsState(map: MapLibreMap): MapBounds {
  const bounds = map.getBounds()
  return {
    north: bounds.getNorth(),
    south: bounds.getSouth(),
    east: bounds.getEast(),
    west: bounds.getWest(),
  }
}

function setInteractions(map: MapLibreMap, enabled: boolean) {
  const interactions = [map.dragPan, map.scrollZoom, map.boxZoom, map.dragRotate, map.keyboard, map.doubleClickZoom, map.touchZoomRotate]
  for (const interaction of interactions) {
    if (enabled) {
      interaction.enable()
    } else {
      interaction.disable()
    }
  }
}

function boundsAreSinglePoint(bounds: MapLibreFitBounds) {
  return bounds[0][0] === bounds[1][0] && bounds[0][1] === bounds[1][1]
}

function fitMapToBounds(map: MapLibreMap, bounds: MapLibreFitBounds, maxZoom: number) {
  if (boundsAreSinglePoint(bounds)) {
    map.easeTo({ center: bounds[0], zoom: Math.min(16, maxZoom), duration: 0 })
    return
  }
  map.fitBounds(bounds, { padding: 28, maxZoom: Math.min(16, maxZoom), duration: 0 })
}

const CLUSTER_MAX_ZOOM = 12
const CLUSTER_FIT_DURATION_MS = 350
const CLUSTER_FIT_PADDING = 28

function parseClusterBounds(properties: Record<string, unknown>): MapLibreFitBounds | null {
  const minLng = Number(properties.minLng)
  const minLat = Number(properties.minLat)
  const maxLng = Number(properties.maxLng)
  const maxLat = Number(properties.maxLat)

  if (![minLng, minLat, maxLng, maxLat].every(Number.isFinite)) return null
  if (minLng > maxLng || minLat > maxLat) return null

  return [[minLng, minLat], [maxLng, maxLat]]
}

function getClusterQueryZoom(map: MapLibreMap, bounds: MapLibreFitBounds, maxZoom: number) {
  const cappedMaxZoom = Math.min(CLUSTER_MAX_ZOOM, maxZoom)
  const camera = map.cameraForBounds(bounds, {
    padding: CLUSTER_FIT_PADDING,
    maxZoom: cappedMaxZoom,
  })
  const cameraZoom = typeof camera?.zoom === 'number' && Number.isFinite(camera.zoom)
    ? camera.zoom
    : cappedMaxZoom

  // The RPC clusters at integer zooms. Query the integer level the fit animation is
  // entering rather than flooring back to the previous cluster bucket.
  return Math.min(cappedMaxZoom, Math.max(0, Math.ceil(cameraZoom)))
}

function fitMapToClusterBounds(map: MapLibreMap, bounds: MapLibreFitBounds, maxZoom: number) {
  map.fitBounds(bounds, {
    padding: CLUSTER_FIT_PADDING,
    maxZoom: Math.min(CLUSTER_MAX_ZOOM, maxZoom),
    duration: CLUSTER_FIT_DURATION_MS,
  })
}

export default function MapLibreVectorMap({
  'aria-label': ariaLabel,
  center,
  zoom,
  minZoom = 0,
  maxZoom = 19,
  fitBounds = null,
  focusBounds = null,
  pinsGeoJson,
  clustersGeoJson,
  userLocation = null,
  interactive = true,
  staticPreview = false,
  offline = false,
  className,
  onReady,
  onViewportChange,
  onPinSelect,
  onClusterSelect,
  onFailure,
  focusOnReady = false,
}: MapLibreVectorMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const baseStyleReadyRef = useRef(false)
  const readyRef = useRef(false)
  const clusterMoveRef = useRef(false)
  const onReadyRef = useRef(onReady)
  const onViewportChangeRef = useRef(onViewportChange)
  const onPinSelectRef = useRef(onPinSelect)
  const onClusterSelectRef = useRef(onClusterSelect)
  const onFailureRef = useRef(onFailure)
  const style = useMemo(() => buildMapLibreStyle(getVectorMapConfig({ offline })), [offline])
  const userLocationGeoJson = useMemo<GeoJSON.FeatureCollection<GeoJSON.Point>>(() => ({
    type: 'FeatureCollection',
    features: userLocation ? [{
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [userLocation.longitude, userLocation.latitude] },
      properties: {},
    }] : [],
  }), [userLocation])
  const pinsGeoJsonRef = useRef(pinsGeoJson)
  const clustersGeoJsonRef = useRef(clustersGeoJson)
  const userLocationGeoJsonRef = useRef(userLocationGeoJson)
  const fitBoundsRef = useRef(fitBounds)
  pinsGeoJsonRef.current = pinsGeoJson
  clustersGeoJsonRef.current = clustersGeoJson
  userLocationGeoJsonRef.current = userLocationGeoJson
  fitBoundsRef.current = fitBounds

  useEffect(() => {
    onReadyRef.current = onReady
    onViewportChangeRef.current = onViewportChange
    onPinSelectRef.current = onPinSelect
    onClusterSelectRef.current = onClusterSelect
    onFailureRef.current = onFailure
  }, [onClusterSelect, onFailure, onPinSelect, onReady, onViewportChange])

  useEffect(() => {
    const container = containerRef.current
    if (!container || mapRef.current) return

    let map: MapLibreMap
    try {
      map = new maplibregl.Map({
        container,
        style,
        center,
        zoom,
        minZoom,
        maxZoom,
        attributionControl: false,
      })
    } catch (error) {
      onFailureRef.current?.(classifyMapFailure(error))
      return
    }
    mapRef.current = map
    try {
      map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right')

      if (!staticPreview) {
        map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
      }
      setInteractions(map, interactive && !staticPreview)
    } catch (error) {
      onFailureRef.current?.(classifyMapFailure(error))
      map.remove()
      mapRef.current = null
      return
    }

    let viewportTimer: ReturnType<typeof setTimeout> | null = null
    let initialViewportEmitted = false
    const emitViewport = () => {
      onViewportChangeRef.current?.({ zoom: map.getZoom(), bounds: getBoundsState(map) })
    }
    const emitInitialViewport = () => {
      if (initialViewportEmitted) return
      initialViewportEmitted = true
      emitViewport()
    }
    const markBaseStyleReady = () => {
      if (baseStyleReadyRef.current) return
      baseStyleReadyRef.current = true
      if (focusOnReady) container.focus({ preventScroll: true })
      onReadyRef.current?.()
    }
    const emitViewportDebounced = () => {
      if (viewportTimer) clearTimeout(viewportTimer)
      viewportTimer = setTimeout(emitViewport, 250)
    }
    const cancelPendingViewport = () => {
      if (viewportTimer) clearTimeout(viewportTimer)
      viewportTimer = null
    }
    const handleMoveEnd = () => {
      if (clusterMoveRef.current) {
        clusterMoveRef.current = false
        cancelPendingViewport()
        return
      }
      emitViewportDebounced()
    }
    map.on('movestart', cancelPendingViewport)
    map.on('moveend', handleMoveEnd)

    map.on('error', (event) => {
      const error = 'error' in event ? event.error : new Error('Map resource failed to load')
      onFailureRef.current?.(classifyMapFailure(error, { resource: true, fatal: !baseStyleReadyRef.current }))
    })

    // Once the base style exists, the map can be shown and its initial camera queried.
    // Keep letsboulder-owned source/layer mutations on full `load` so they cannot disturb
    // MapLibre's first basemap render, but do not keep the loading shell over a usable map.
    map.on('style.load', () => {
      markBaseStyleReady()
      emitInitialViewport()
    })

    map.on('load', () => {
      try {
        map.addSource('letsboulder-pins', { type: 'geojson', data: pinsGeoJsonRef.current })
        map.addLayer({
          id: 'letsboulder-pin-circles',
          type: 'circle',
          source: 'letsboulder-pins',
          paint: {
            'circle-radius': ['case', ['boolean', ['get', 'active'], false], 13, 11],
            'circle-color': ['case', ['boolean', ['get', 'active'], false], '#d4a017', ['==', ['get', 'placeType'], 'gym'], '#2563eb', '#ef4444'],
            'circle-stroke-color': '#ffffff',
            'circle-stroke-width': 2,
            'circle-opacity': ['case', ['==', ['get', 'tone'], 'published'], 0.75, 1],
          },
        })
        map.addLayer({
          id: 'letsboulder-pin-labels',
          type: 'symbol',
          source: 'letsboulder-pins',
          layout: {
            'text-field': ['to-string', ['get', 'label']],
            'text-size': 11,
            'text-font': ['Noto Sans Bold'],
            'text-allow-overlap': true,
          },
          paint: { 'text-color': '#ffffff' },
        })
        map.addLayer({
          id: 'letsboulder-pin-hit-targets',
          type: 'circle',
          source: 'letsboulder-pins',
          paint: {
            'circle-radius': 22,
            'circle-color': '#ffffff',
            'circle-opacity': 0,
          },
        })

        map.addSource('letsboulder-clusters', { type: 'geojson', data: clustersGeoJsonRef.current || { type: 'FeatureCollection', features: [] } })
        map.addLayer({
          id: 'letsboulder-cluster-circles',
          type: 'circle',
          source: 'letsboulder-clusters',
          paint: {
            'circle-radius': 18,
            'circle-color': '#111827',
            'circle-stroke-color': '#ffffff',
            'circle-stroke-width': 2,
            'circle-opacity': 0.88,
          },
        })
        map.addLayer({
          id: 'letsboulder-cluster-hit-targets',
          type: 'circle',
          source: 'letsboulder-clusters',
          paint: {
            'circle-radius': 22,
            'circle-color': '#ffffff',
            'circle-opacity': 0,
          },
        })
        map.addLayer({
          id: 'letsboulder-cluster-labels',
          type: 'symbol',
          source: 'letsboulder-clusters',
          layout: {
            'text-field': ['to-string', ['get', 'pointCount']],
            'text-size': 12,
            'text-font': ['Noto Sans Bold'],
            'text-allow-overlap': true,
          },
          paint: { 'text-color': '#ffffff' },
        })

        map.addSource('letsboulder-user-location', { type: 'geojson', data: userLocationGeoJsonRef.current })
        map.addLayer({
          id: 'letsboulder-user-location-halo',
          type: 'circle',
          source: 'letsboulder-user-location',
          paint: {
            'circle-radius': 13,
            'circle-color': '#2563eb',
            'circle-opacity': 0.18,
          },
        })
        map.addLayer({
          id: 'letsboulder-user-location-dot',
          type: 'circle',
          source: 'letsboulder-user-location',
          paint: {
            'circle-radius': 6,
            'circle-color': '#2563eb',
            'circle-stroke-color': '#ffffff',
            'circle-stroke-width': 2,
          },
        })

        map.on('click', 'letsboulder-pin-hit-targets', (event) => {
          const feature = event.features?.[0]
          const properties = feature?.properties
          if (!properties || properties.interactive === false) return
          const selectId = typeof properties.selectId === 'string' ? properties.selectId : properties.id
          if (typeof selectId === 'string') onPinSelectRef.current?.(selectId)
        })
        map.on('click', 'letsboulder-cluster-hit-targets', (event) => {
          const feature = event.features?.[0]
          const properties = feature?.properties
          if (!feature || !properties || feature.geometry.type !== 'Point') return

          const bounds = parseClusterBounds(properties as Record<string, unknown>)
          if (!bounds) return

          const queryZoom = getClusterQueryZoom(map, bounds, maxZoom)
          clusterMoveRef.current = true
          cancelPendingViewport()
          onClusterSelectRef.current?.({ bounds, queryZoom })
          fitMapToClusterBounds(map, bounds, maxZoom)
        })
        map.on('mouseenter', 'letsboulder-pin-hit-targets', () => { map.getCanvas().style.cursor = 'pointer' })
        map.on('mouseleave', 'letsboulder-pin-hit-targets', () => { map.getCanvas().style.cursor = '' })
        map.on('mouseenter', 'letsboulder-cluster-hit-targets', () => { map.getCanvas().style.cursor = 'pointer' })
        map.on('mouseleave', 'letsboulder-cluster-hit-targets', () => { map.getCanvas().style.cursor = '' })

        readyRef.current = true
        if (fitBoundsRef.current) fitMapToBounds(map, fitBoundsRef.current, maxZoom)
        markBaseStyleReady()
        emitInitialViewport()
      } catch (error) {
        onFailureRef.current?.(classifyMapFailure(error))
      }
    })

    return () => {
      if (viewportTimer) clearTimeout(viewportTimer)
      baseStyleReadyRef.current = false
      readyRef.current = false
      map.remove()
      mapRef.current = null
    }
  // MapLibre owns this imperative lifecycle; subsequent prop changes update sources and controls below.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !readyRef.current) return
    getSource(map, 'letsboulder-pins')?.setData(pinsGeoJson)
  }, [pinsGeoJson])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !readyRef.current) return
    getSource(map, 'letsboulder-clusters')?.setData(clustersGeoJson || { type: 'FeatureCollection', features: [] })
  }, [clustersGeoJson])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !readyRef.current) return
    getSource(map, 'letsboulder-user-location')?.setData(userLocationGeoJson)
  }, [userLocationGeoJson])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    map.setMinZoom(minZoom)
    map.setMaxZoom(maxZoom)
  }, [maxZoom, minZoom])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    setInteractions(map, interactive && !staticPreview)
  }, [interactive, staticPreview])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !readyRef.current || !fitBounds) return
    fitMapToBounds(map, fitBounds, maxZoom)
  }, [fitBounds, maxZoom])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !readyRef.current || !focusBounds) return

    const queryZoom = getClusterQueryZoom(map, focusBounds, maxZoom)
    clusterMoveRef.current = true
    onClusterSelectRef.current?.({ bounds: focusBounds, queryZoom })
    fitMapToClusterBounds(map, focusBounds, maxZoom)
  }, [focusBounds, maxZoom])

  return <div ref={containerRef} className={className} data-testid="maplibre-vector-map" role="region" aria-label={ariaLabel} tabIndex={focusOnReady ? -1 : undefined} />
}
