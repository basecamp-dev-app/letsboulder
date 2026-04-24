'use client'

import { useEffect, useMemo, useRef } from 'react'
import maplibregl, { type GeoJSONSource, type Map as MapLibreMap } from 'maplibre-gl'

import { buildMapLibreStyle } from '@/lib/map/maplibre-style'
import { getVectorMapConfig } from '@/lib/map/vector-map-config'

export interface MapBounds {
  north: number
  south: number
  east: number
  west: number
}

export type MapLibreLngLat = [number, number]
export type MapLibreFitBounds = [MapLibreLngLat, MapLibreLngLat]

interface MapLibreVectorMapProps {
  center: MapLibreLngLat
  zoom: number
  minZoom?: number
  maxZoom?: number
  fitBounds?: MapLibreFitBounds | null
  pinsGeoJson: GeoJSON.FeatureCollection<GeoJSON.Point>
  clustersGeoJson?: GeoJSON.FeatureCollection<GeoJSON.Point>
  activePinId?: string | null
  interactive?: boolean
  staticPreview?: boolean
  offline?: boolean
  className?: string
  onReady?: () => void
  onViewportChange?: (state: { zoom: number; bounds: MapBounds }) => void
  onPinSelect?: (id: string) => void
  onClusterSelect?: (clusterId: number, coordinates: MapLibreLngLat) => void
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

export default function MapLibreVectorMap({
  center,
  zoom,
  minZoom = 0,
  maxZoom = 19,
  fitBounds = null,
  pinsGeoJson,
  clustersGeoJson,
  interactive = true,
  staticPreview = false,
  offline = false,
  className,
  onReady,
  onViewportChange,
  onPinSelect,
  onClusterSelect,
}: MapLibreVectorMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const readyRef = useRef(false)
  const onReadyRef = useRef(onReady)
  const onViewportChangeRef = useRef(onViewportChange)
  const onPinSelectRef = useRef(onPinSelect)
  const onClusterSelectRef = useRef(onClusterSelect)
  const style = useMemo(() => buildMapLibreStyle(getVectorMapConfig({ offline })), [offline])

  useEffect(() => {
    onReadyRef.current = onReady
    onViewportChangeRef.current = onViewportChange
    onPinSelectRef.current = onPinSelect
    onClusterSelectRef.current = onClusterSelect
  }, [onClusterSelect, onPinSelect, onReady, onViewportChange])

  useEffect(() => {
    const container = containerRef.current
    if (!container || mapRef.current) return

    const map = new maplibregl.Map({
      container,
      style,
      center,
      zoom,
      minZoom,
      maxZoom,
      attributionControl: { compact: true },
    })
    mapRef.current = map

    if (!staticPreview) {
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
    }
    setInteractions(map, interactive && !staticPreview)

    const emitViewport = () => {
      onViewportChangeRef.current?.({ zoom: map.getZoom(), bounds: getBoundsState(map) })
    }
    map.on('moveend', emitViewport)
    map.on('zoomend', emitViewport)

    map.on('load', () => {
      map.addSource('letsboulder-pins', { type: 'geojson', data: pinsGeoJson })
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

      map.addSource('letsboulder-clusters', { type: 'geojson', data: clustersGeoJson || { type: 'FeatureCollection', features: [] } })
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

      map.on('click', 'letsboulder-pin-circles', (event) => {
        const feature = event.features?.[0]
        const properties = feature?.properties
        if (!properties || properties.interactive === false) return
        const selectId = typeof properties.selectId === 'string' ? properties.selectId : properties.id
        if (typeof selectId === 'string') onPinSelectRef.current?.(selectId)
      })
      map.on('click', 'letsboulder-cluster-circles', (event) => {
        const feature = event.features?.[0]
        const properties = feature?.properties
        if (!feature || !properties || feature.geometry.type !== 'Point') return
        const clusterId = Number(properties.clusterId)
        const expansionZoom = Number(properties.expansionZoom)
        const coordinates = feature.geometry.coordinates as MapLibreLngLat
        if (Number.isFinite(expansionZoom)) {
          map.easeTo({ center: coordinates, zoom: Math.min(expansionZoom, maxZoom), duration: 450 })
        }
        if (Number.isFinite(clusterId)) onClusterSelectRef.current?.(clusterId, coordinates)
      })
      map.on('mouseenter', 'letsboulder-pin-circles', () => { map.getCanvas().style.cursor = 'pointer' })
      map.on('mouseleave', 'letsboulder-pin-circles', () => { map.getCanvas().style.cursor = '' })
      map.on('mouseenter', 'letsboulder-cluster-circles', () => { map.getCanvas().style.cursor = 'pointer' })
      map.on('mouseleave', 'letsboulder-cluster-circles', () => { map.getCanvas().style.cursor = '' })

      readyRef.current = true
      emitViewport()
      onReadyRef.current?.()
    })

    return () => {
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
    if (boundsAreSinglePoint(fitBounds)) {
      map.easeTo({ center: fitBounds[0], zoom: Math.min(16, maxZoom), duration: 0 })
      return
    }
    map.fitBounds(fitBounds, { padding: 28, maxZoom: Math.min(16, maxZoom), duration: 0 })
  }, [fitBounds, maxZoom])

  return <div ref={containerRef} className={className} data-testid="maplibre-vector-map" />
}
