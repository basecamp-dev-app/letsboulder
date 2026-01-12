'use client'

import { useEffect, useState, useRef } from 'react'
import dynamic from 'next/dynamic'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'
import { geoJsonPolygonToLeaflet, getPolygonCenter, GeoJSONPolygon } from '@/lib/geo-utils'
import L from 'leaflet'

import 'leaflet/dist/leaflet.css'

delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-blue.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
})

const MapContainer = dynamic(() => import('react-leaflet').then(mod => mod.MapContainer), { ssr: false })
const TileLayer = dynamic(() => import('react-leaflet').then(mod => mod.TileLayer), { ssr: false })
const Marker = dynamic(() => import('react-leaflet').then(mod => mod.Marker), { ssr: false })
const Polygon = dynamic(() => import('react-leaflet').then(mod => mod.Polygon), { ssr: false })
const Tooltip = dynamic(() => import('react-leaflet').then(mod => mod.Tooltip), { ssr: false })

interface Crag {
  id: string
  name: string
  latitude: number
  longitude: number
  region_id: string | null
  description: string | null
  access_notes: string | null
  rock_type: string | null
  type: string | null
  boundary: GeoJSONPolygon | null
  regions?: {
    id: string
    name: string
  }
}

interface ImageData {
  id: string
  url: string
  latitude: number | null
  longitude: number | null
  created_at: string
  route_lines_count: number
  is_verified: boolean
  verification_count: number
}

export default function CragPage({ params }: { params: Promise<{ id: string }> }) {
  const [crag, setCrag] = useState<Crag | null>(null)
  const [images, setImages] = useState<ImageData[]>([])
  const [loading, setLoading] = useState(true)
  const [isClient, setIsClient] = useState(false)
  const mapRef = useRef<L.Map | null>(null)

  useEffect(() => {
    setIsClient(true)
  }, [])

  useEffect(() => {
    if (!isClient) return

    async function loadCrag() {
      const supabase = createClient()
      const { id } = await params

      const { data: cragData, error: cragError } = await supabase
        .from('crags')
        .select(`
          *,
          regions:region_id (id, name)
        `)
        .eq('id', id)
        .single()

      if (cragError || !cragData) {
        console.error('Error fetching crag:', cragError)
        setLoading(false)
        return
      }

      const { data: imagesData, error: imagesError } = await supabase
        .from('images')
        .select('id, url, latitude, longitude, created_at, is_verified, verification_count, route_lines(count)')
        .eq('crag_id', id)
        .not('latitude', 'is', null)
        .order('created_at', { ascending: false })

      if (imagesError) {
        console.error('Error fetching images:', imagesError)
      }

      const formattedImages = (imagesData || []).map((img: any) => ({
        id: img.id,
        url: img.url,
        latitude: img.latitude,
        longitude: img.longitude,
        created_at: img.created_at,
        is_verified: img.is_verified || false,
        verification_count: img.verification_count || 0,
        route_lines_count: Array.isArray(img.route_lines) && img.route_lines[0] ? (img.route_lines[0] as { count: number }).count : 0
      }))

      setCrag(cragData)
      setImages(formattedImages)
      setLoading(false)
    }

    loadCrag()
  }, [isClient, params])

  useEffect(() => {
    if (!isClient || !mapRef.current || !crag) return

    const center = crag.boundary ? getPolygonCenter(crag.boundary) : null
    const viewCenter: [number, number] = center ? [center[0], center[1]] : [crag.latitude, crag.longitude]
    mapRef.current.setView(viewCenter, 14)
  }, [isClient, crag])

  if (!isClient) {
    return <div className="h-screen w-full bg-gray-900" />
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-gray-500 dark:text-gray-400">Loading crag...</div>
      </div>
    )
  }

  if (!crag) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-gray-500 dark:text-gray-400">Crag not found</div>
      </div>
    )
  }

  const boundaryCoords = crag.boundary ? geoJsonPolygonToLeaflet(crag.boundary) : null

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="relative h-[50vh] bg-gray-200 dark:bg-gray-800">
        <MapContainer
          ref={mapRef as any}
          center={[crag.latitude, crag.longitude]}
          zoom={14}
          style={{ height: '100%', width: '100%' }}
          zoomControl={true}
          scrollWheelZoom={true}
        >
          <TileLayer
            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            attribution='Tiles © Esri'
            maxZoom={19}
          />

          {boundaryCoords && (
            <Polygon
              positions={boundaryCoords}
              pathOptions={{
                color: '#3b82f6',
                fillColor: '#3b82f6',
                fillOpacity: 0.2,
                weight: 2,
                dashArray: '5, 10'
              }}
            >
              <Tooltip direction="center" opacity={1}>
                <span className="font-semibold">Crag Boundary</span>
              </Tooltip>
            </Polygon>
          )}

          <Marker
            position={[crag.latitude, crag.longitude]}
            icon={L.divIcon({
              className: 'crag-marker',
              html: `<div style="
                background: #3b82f6;
                width: 28px;
                height: 28px;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                color: white;
                font-size: 12px;
                font-weight: bold;
                border: 3px solid white;
                box-shadow: 0 2px 8px rgba(0,0,0,0.3);
              ">📍</div>`,
              iconSize: [28, 28],
              iconAnchor: [14, 14]
            })}
          >
            <Tooltip direction="top" offset={[0, -30]} opacity={1}>
              <div>
                <p className="font-semibold">{crag.name}</p>
                {crag.regions && <p className="text-sm">{crag.regions.name}</p>}
              </div>
            </Tooltip>
          </Marker>

          {images.map((image) => (
            image.latitude && image.longitude && (
              <Marker
                key={image.id}
                position={[image.latitude, image.longitude]}
                icon={L.divIcon({
                  className: 'image-marker',
                  html: `<div style="
                    background: ${image.is_verified ? '#22c55e' : '#eab308'};
                    width: 20px;
                    height: 20px;
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: white;
                    font-size: 10px;
                    font-weight: bold;
                    border: 2px solid white;
                    box-shadow: 0 1px 4px rgba(0,0,0,0.3);
                  ">${image.route_lines_count}</div>`,
                  iconSize: [20, 20],
                  iconAnchor: [10, 10]
                })}
              />
            )
          ))}
        </MapContainer>

        <Link
          href="/map"
          className="absolute top-4 left-4 z-[1000] bg-white dark:bg-gray-800 rounded-lg px-3 py-2 text-sm font-medium shadow-md hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
        >
          ← Back to Map
        </Link>
      </div>

      <div className="max-w-4xl mx-auto p-6">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">{crag.name}</h1>
          {crag.regions && (
            <p className="text-lg text-gray-600 dark:text-gray-400">{crag.regions.name}</p>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
          {crag.rock_type && (
            <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm">
              <p className="text-sm text-gray-500 dark:text-gray-400">Rock Type</p>
              <p className="font-medium text-gray-900 dark:text-gray-100 capitalize">{crag.rock_type}</p>
            </div>
          )}
          {crag.type && (
            <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm">
              <p className="text-sm text-gray-500 dark:text-gray-400">Type</p>
              <p className="font-medium text-gray-900 dark:text-gray-100 capitalize">{crag.type}</p>
            </div>
          )}
          <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm">
            <p className="text-sm text-gray-500 dark:text-gray-400">Routes</p>
            <p className="font-medium text-gray-900 dark:text-gray-100">{images.reduce((sum, img) => sum + img.route_lines_count, 0)}</p>
          </div>
        </div>

        {crag.description && (
          <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm mb-6">
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">Description</p>
            <p className="text-gray-900 dark:text-gray-100">{crag.description}</p>
          </div>
        )}

        {crag.access_notes && (
          <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm mb-6">
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">Access Notes</p>
            <p className="text-gray-900 dark:text-gray-100">{crag.access_notes}</p>
          </div>
        )}

        <div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">Route Images ({images.length})</h2>
          {images.length === 0 ? (
            <p className="text-gray-500 dark:text-gray-400">No route images yet</p>
          ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {images.map((image) => (
                  <Link
                    key={image.id}
                    href={`/image/${image.id}`}
                    className="block bg-white dark:bg-gray-800 rounded-lg overflow-hidden shadow-sm hover:shadow-md transition-shadow"
                  >
                    <div className="relative h-32 bg-gray-200 dark:bg-gray-700">
                      <img
                        src={image.url}
                        alt="Route image"
                        className="absolute inset-0 w-full h-full object-cover"
                      />
                      <div className="absolute bottom-2 right-2 bg-gray-900/80 text-white text-xs px-2 py-1 rounded-full">
                        {image.route_lines_count} routes
                      </div>
                      <div className={`absolute top-2 right-2 px-1.5 py-0.5 rounded text-xs font-medium ${
                        image.is_verified
                          ? 'bg-green-500 text-white'
                          : 'bg-yellow-500 text-white'
                      }`}>
                        {image.is_verified ? '✓' : `${image.verification_count}/3`}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
          )}
        </div>
      </div>
    </div>
  )
}
