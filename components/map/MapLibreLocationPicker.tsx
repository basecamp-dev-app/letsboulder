'use client'

import { useEffect, useMemo, useRef } from 'react'
import maplibregl, { type Map as MapLibreMap, type Marker } from 'maplibre-gl'

import { buildMapLibreStyle } from '@/lib/map/maplibre-style'
import { getVectorMapConfig } from '@/lib/map/vector-map-config'

export interface LocationPoint {
  latitude: number
  longitude: number
}

interface MapLibreLocationPickerProps {
  value: LocationPoint | null
  defaultCenter?: LocationPoint
  defaultZoom?: number
  selectedZoom?: number
  offline?: boolean
  className?: string
  onChange: (next: LocationPoint) => void
}

function createMarkerElement() {
  const element = document.createElement('div')
  element.className = 'maplibre-location-marker'
  element.style.width = '22px'
  element.style.height = '22px'
  element.style.borderRadius = '9999px'
  element.style.background = '#dc2626'
  element.style.border = '3px solid white'
  element.style.boxShadow = '0 8px 18px rgba(15, 23, 42, 0.3)'
  return element
}

export default function MapLibreLocationPicker({
  value,
  defaultCenter = { latitude: 20, longitude: 0 },
  defaultZoom = 2,
  selectedZoom = 14,
  offline = false,
  className,
  onChange,
}: MapLibreLocationPickerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const markerRef = useRef<Marker | null>(null)
  const onChangeRef = useRef(onChange)
  const center = value || defaultCenter
  const style = useMemo(() => buildMapLibreStyle(getVectorMapConfig({ offline })), [offline])

  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  useEffect(() => {
    const container = containerRef.current
    if (!container || mapRef.current) return

    const map = new maplibregl.Map({
      container,
      style,
      center: [center.longitude, center.latitude],
      zoom: value ? selectedZoom : defaultZoom,
      minZoom: 1,
      maxZoom: 19,
      attributionControl: { compact: true },
    })
    mapRef.current = map
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')

    map.on('click', (event) => {
      onChangeRef.current({ latitude: event.lngLat.lat, longitude: event.lngLat.lng })
    })

    return () => {
      markerRef.current?.remove()
      markerRef.current = null
      map.remove()
      mapRef.current = null
    }
  // MapLibre owns initialization; controlled value updates run below.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    if (!value) {
      markerRef.current?.remove()
      markerRef.current = null
      map.easeTo({ center: [defaultCenter.longitude, defaultCenter.latitude], zoom: defaultZoom, duration: 250 })
      return
    }

    const lngLat: [number, number] = [value.longitude, value.latitude]
    if (!markerRef.current) {
      markerRef.current = new maplibregl.Marker({ element: createMarkerElement(), draggable: true })
        .setLngLat(lngLat)
        .addTo(map)
      markerRef.current.on('dragend', () => {
        const next = markerRef.current?.getLngLat()
        if (next) onChangeRef.current({ latitude: next.lat, longitude: next.lng })
      })
    } else {
      markerRef.current.setLngLat(lngLat)
    }

    map.easeTo({ center: lngLat, zoom: Math.max(map.getZoom(), selectedZoom), duration: 250 })
  }, [defaultCenter.latitude, defaultCenter.longitude, defaultZoom, selectedZoom, value])

  return <div ref={containerRef} className={className} data-testid="maplibre-location-picker" />
}
