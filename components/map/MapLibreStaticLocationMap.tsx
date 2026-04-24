'use client'

import { useEffect, useMemo, useRef } from 'react'
import maplibregl, { type Map as MapLibreMap, type Marker } from 'maplibre-gl'

import { registerPmtilesProtocol } from '@/components/map/MapLibreVectorMap'
import { buildMapLibreStyle } from '@/lib/map/maplibre-style'
import { getVectorMapConfig } from '@/lib/map/vector-map-config'

interface LocationPoint {
  latitude: number
  longitude: number
}

interface MapLibreStaticLocationMapProps {
  point: LocationPoint
  secondaryPoint?: LocationPoint | null
  zoom?: number
  offline?: boolean
  className?: string
}

function createDot(color: string, size: number, halo = false) {
  const element = document.createElement('div')
  element.style.width = `${size}px`
  element.style.height = `${size}px`
  element.style.borderRadius = '9999px'
  element.style.background = color
  element.style.border = '3px solid white'
  element.style.boxShadow = halo ? '0 0 0 8px rgba(37, 99, 235, 0.18), 0 4px 12px rgba(15, 23, 42, 0.25)' : '0 6px 16px rgba(15, 23, 42, 0.28)'
  return element
}

export default function MapLibreStaticLocationMap({ point, secondaryPoint = null, zoom = 17, offline = false, className }: MapLibreStaticLocationMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const primaryMarkerRef = useRef<Marker | null>(null)
  const secondaryMarkerRef = useRef<Marker | null>(null)
  const style = useMemo(() => buildMapLibreStyle(getVectorMapConfig({ offline })), [offline])

  useEffect(() => {
    const container = containerRef.current
    if (!container || mapRef.current) return

    registerPmtilesProtocol()
    const map = new maplibregl.Map({
      container,
      style,
      center: [point.longitude, point.latitude],
      zoom,
      minZoom: 1,
      maxZoom: 19,
      attributionControl: false,
    })
    mapRef.current = map
    map.dragPan.disable()
    map.scrollZoom.disable()
    map.boxZoom.disable()
    map.dragRotate.disable()
    map.keyboard.disable()
    map.doubleClickZoom.disable()
    map.touchZoomRotate.disable()

    return () => {
      primaryMarkerRef.current?.remove()
      secondaryMarkerRef.current?.remove()
      primaryMarkerRef.current = null
      secondaryMarkerRef.current = null
      map.remove()
      mapRef.current = null
    }
  // MapLibre owns initialization; point updates run below.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    const primaryLngLat: [number, number] = [point.longitude, point.latitude]
    if (!primaryMarkerRef.current) {
      primaryMarkerRef.current = new maplibregl.Marker({ element: createDot('#dc2626', 18) }).setLngLat(primaryLngLat).addTo(map)
    } else {
      primaryMarkerRef.current.setLngLat(primaryLngLat)
    }

    if (secondaryPoint) {
      const secondaryLngLat: [number, number] = [secondaryPoint.longitude, secondaryPoint.latitude]
      if (!secondaryMarkerRef.current) {
        secondaryMarkerRef.current = new maplibregl.Marker({ element: createDot('#2563eb', 18, true) }).setLngLat(secondaryLngLat).addTo(map)
      } else {
        secondaryMarkerRef.current.setLngLat(secondaryLngLat)
      }
      if (primaryLngLat[0] === secondaryLngLat[0] && primaryLngLat[1] === secondaryLngLat[1]) {
        map.easeTo({ center: primaryLngLat, zoom, duration: 0 })
      } else {
        map.fitBounds([primaryLngLat, secondaryLngLat], { padding: 24, maxZoom: 17, duration: 0 })
      }
      return
    }

    secondaryMarkerRef.current?.remove()
    secondaryMarkerRef.current = null
    map.easeTo({ center: primaryLngLat, zoom, duration: 0 })
  }, [point.latitude, point.longitude, secondaryPoint, zoom])

  return <div ref={containerRef} className={className} data-testid="maplibre-static-location-map" />
}
