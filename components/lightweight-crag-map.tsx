'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { uploadDebug } from '@/lib/media/upload-debug'

import 'leaflet/dist/leaflet.css'

const MapContainer = dynamic(() => import('react-leaflet').then((mod) => mod.MapContainer), { ssr: false })
const TileLayer = dynamic(() => import('react-leaflet').then((mod) => mod.TileLayer), { ssr: false })
const Marker = dynamic(() => import('react-leaflet').then((mod) => mod.Marker), { ssr: false })
const ZoomControl = dynamic(() => import('react-leaflet').then((mod) => mod.ZoomControl), { ssr: false })

export interface LightweightCragMapPin {
  id: string
  latitude: number
  longitude: number
  label?: string
  interactive?: boolean
  tone?: 'draft' | 'published'
}

function pinVisualStyles(active: boolean, tone: 'draft' | 'published') {
  if (active) {
    return {
      background: tone === 'published' ? '#1d4ed8' : '#1d4ed8',
      border: 'white',
      shadow: '0 6px 18px rgba(15,23,42,0.28)',
      size: 24,
      fontSize: 11,
      scale: 'scale(1)',
      opacity: '1',
      ring: '',
    }
  }

  if (tone === 'published') {
    return {
      background: 'rgba(107,114,128,0.78)',
      border: 'rgba(255,255,255,0.85)',
      shadow: '0 4px 12px rgba(15,23,42,0.18)',
      size: 24,
      fontSize: 11,
      scale: 'scale(1)',
      opacity: '0.82',
      ring: '',
    }
  }

  return {
    background: '#1d4ed8',
    border: 'white',
    shadow: '0 6px 18px rgba(15,23,42,0.28)',
    size: 24,
    fontSize: 11,
    scale: 'scale(1)',
    opacity: '1',
    ring: '',
  }
}

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

function normalizeCoordinateKey(latitude: number, longitude: number): string {
  return `${latitude.toFixed(6)}:${longitude.toFixed(6)}`
}

function normalizePins(pins: LightweightCragMapPin[], activePinId: string | null) {
  const groupedPins = new Map<string, LightweightCragMapPin[]>()

  pins.forEach((pin) => {
    const key = normalizeCoordinateKey(pin.latitude, pin.longitude)
    const existingGroup = groupedPins.get(key)
    if (existingGroup) {
      existingGroup.push(pin)
      return
    }

    groupedPins.set(key, [pin])
  })

  return Array.from(groupedPins.values()).map((group, index) => {
    const representative = activePinId
      ? group.find((pin) => pin.id === activePinId) || group[0]
      : group[0]

    return {
      ...representative,
      label: representative.label || group[0]?.label || String(index + 1),
    }
  })
}

export default function LightweightCragMap({
  pins = [],
  draftPins,
  publishedPins,
  activePinId = null,
  initialCenter = null,
  onPinSelect,
  className,
  tileUrl = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  attribution = 'Tiles © Esri',
  heightClassName = 'min-h-[260px] md:min-h-[320px]',
}: LightweightCragMapProps) {
  const mapRef = useRef<import('leaflet').Map | null>(null)
  const [mapReady, setMapReady] = useState(false)
  const [leafletLib, setLeafletLib] = useState<typeof import('leaflet') | null>(null)
  const [minAllowedZoom, setMinAllowedZoom] = useState<number | null>(null)
  const resolvedPins = useMemo(() => {
    if (draftPins || publishedPins) {
      return [
        ...(publishedPins || []).map((pin) => ({ ...pin, interactive: pin.interactive ?? false, tone: pin.tone ?? 'published' as const })),
        ...(draftPins || []).map((pin) => ({ ...pin, interactive: pin.interactive ?? true, tone: pin.tone ?? 'draft' as const })),
      ]
    }
    return pins
  }, [draftPins, pins, publishedPins])
  const normalizedPins = useMemo(() => normalizePins(resolvedPins, activePinId), [activePinId, resolvedPins])

  useEffect(() => {
    if (typeof window === 'undefined') return
    void import('leaflet').then((leaflet) => {
      setLeafletLib(leaflet as unknown as typeof import('leaflet'))
    })
  }, [])

  const center = useMemo<[number, number]>(() => {
    if (initialCenter) return initialCenter
    if (resolvedPins.length === 0) return [0, 0]
    const latitude = resolvedPins.reduce((sum, pin) => sum + pin.latitude, 0) / resolvedPins.length
    const longitude = resolvedPins.reduce((sum, pin) => sum + pin.longitude, 0) / resolvedPins.length
    return [latitude, longitude]
  }, [initialCenter, resolvedPins])

  useEffect(() => {
    uploadDebug('map-debug-state', {
      activePinId,
      normalizedPinsCount: normalizedPins.length,
      hasActivePin: Boolean(activePinId && normalizedPins.some((pin) => pin.id === activePinId)),
      normalizedPinIds: normalizedPins.map((pin) => pin.id),
    })
  }, [activePinId, normalizedPins])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !leafletLib || !mapReady || normalizedPins.length === 0) return

    const container = map.getContainer?.()
    if (!container || !container.isConnected) return

    const frameId = window.requestAnimationFrame(() => {
      const nextContainer = map.getContainer?.()
      if (!nextContainer || !nextContainer.isConnected) return

      map.invalidateSize()
      const activePin = activePinId ? normalizedPins.find((pin) => pin.id === activePinId) || null : null
      if (activePin) {
        map.panTo([activePin.latitude, activePin.longitude], { animate: true })
        const currentZoom = map.getZoom()
        setMinAllowedZoom(Math.max(2, currentZoom - 1))
        return
      }

      const bounds = leafletLib.latLngBounds(normalizedPins.map((pin) => [pin.latitude, pin.longitude] as [number, number]))
      map.fitBounds(bounds, { padding: [28, 28], maxZoom: 16, animate: false })
      const fittedZoom = map.getZoom()
      setMinAllowedZoom(Math.max(2, fittedZoom - 1))
    })

    return () => {
      window.cancelAnimationFrame(frameId)
    }
  }, [activePinId, leafletLib, mapReady, normalizedPins])

  if (normalizedPins.length === 0) {
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
        <MapContainer
          ref={mapRef as never}
          center={center}
          zoom={15}
          minZoom={minAllowedZoom ?? undefined}
          maxZoom={19}
          style={{ height: '100%', width: '100%' }}
          preferCanvas={true}
          scrollWheelZoom={true}
          doubleClickZoom={true}
          touchZoom={true}
          zoomControl={false}
          whenReady={() => setMapReady(true)}
        >
          <TileLayer url={tileUrl} attribution={attribution} maxZoom={19} />
          <ZoomControl position="topright" />
          {leafletLib && mapReady ? normalizedPins.map((pin, index) => {
            const active = pin.id === activePinId
            uploadDebug('map-render-debug', {
              pinId: pin.id,
              isActive: active,
            })
            const tone = pin.tone ?? 'draft'
            const visual = pinVisualStyles(active, tone)
            return (
              <Marker
                key={pin.id}
                position={[pin.latitude, pin.longitude]}
                zIndexOffset={tone === 'draft' ? 600 : 200}
                icon={leafletLib?.divIcon({
                  className: 'lightweight-crag-map-pin',
                  html: `<div style="position:relative;width:${visual.size}px;height:${visual.size}px;">${visual.ring}<div style="background:${visual.background};width:${visual.size}px;height:${visual.size}px;border-radius:9999px;display:flex;align-items:center;justify-content:center;color:white;font-size:${visual.fontSize}px;font-weight:700;border:2px solid ${visual.border};box-shadow:${visual.shadow};transform:${visual.scale};opacity:${visual.opacity};">${pin.label || index + 1}</div></div>`,
                  iconSize: [visual.size, visual.size],
                  iconAnchor: [visual.size / 2, visual.size / 2],
                })}
                eventHandlers={onPinSelect && pin.interactive !== false ? { click: () => onPinSelect(pin.id) } : undefined}
              />
            )
          }) : null}
        </MapContainer>
      </div>
    </div>
  )
}
