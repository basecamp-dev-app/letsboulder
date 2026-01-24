'use client'

import { useEffect, useState, useRef } from 'react'
import dynamic from 'next/dynamic'
import Image from 'next/image'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'
import { geoJsonPolygonToLeaflet, getPolygonCenter } from '@/lib/geo-utils'
import type { GeoJSONPolygon } from '@/types/database'
import FlagCragModal from './components/FlagCragModal'

import 'leaflet/dist/leaflet.css'

const MapContainer = dynamic(() => import('react-leaflet').then(mod => mod.MapContainer), { ssr: false })
const TileLayer = dynamic(() => import('react-leaflet').then(mod => mod.TileLayer), { ssr: false })
const Marker = dynamic(() => import('react-leaflet').then(mod => mod.Marker), { ssr: false })
const Polygon = dynamic(() => import('react-leaflet').then(mod => mod.Polygon), { ssr: false })
const Tooltip = dynamic(() => import('react-leaflet').then(mod => mod.Tooltip), { ssr: false })
const Popup = dynamic(() => import('react-leaflet').then(mod => mod.Popup), { ssr: false })

interface LeafletIconDefault {
  prototype: {
    _getIconUrl?: () => void
  }
  mergeOptions: (options: Record<string, string>) => void
}

let L: typeof import('leaflet') | null = null

async function setupLeafletIcons() {
  if (typeof window !== 'undefined') {
    const leaflet = await import('leaflet')
    L = leaflet as unknown as typeof import('leaflet')
    const iconDefault = L!.Icon.Default as unknown as LeafletIconDefault
    delete iconDefault.prototype._getIconUrl
    iconDefault.mergeOptions({
      iconRetinaUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
      iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-blue.png',
      shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
    })
  }
}

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

interface RoutePoint {
  x: number
  y: number
}

interface ImageRoute {
  id: string
  points: RoutePoint[]
  color: string
  climb: {
    id: string
    name: string | null
    grade: string | null
    description: string | null
  } | null
}

interface RawRouteLine {
  id: string
  image_id: string
  points: RoutePoint[]
  color: string
  climbs?: {
    id: string
    name: string | null
    grade: string | null
    description: string | null
  }
}

interface ImageData {
  id: string
  url: string
  latitude: number | null
  longitude: number | null
  route_lines: ImageRoute[]
  is_verified: boolean
  verification_count: number
}

export default function CragPage({ params }: { params: Promise<{ id: string }> }) {
  const [crag, setCrag] = useState<Crag | null>(null)
  const [images, setImages] = useState<ImageData[]>([])
  const [loading, setLoading] = useState(true)
  const [mapReady, setMapReady] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [flagModalOpen, setFlagModalOpen] = useState(false)
  const mapRef = useRef<L.Map | null>(null)

  useEffect(() => {
    setupLeafletIcons()
  }, [])

  useEffect(() => {
    async function loadCrag() {
      const supabase = createClient()
      const { id } = await params

      const { data: { user } } = await supabase.auth.getUser()

      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('is_admin')
          .eq('id', user.id)
          .single()
        setIsAdmin(profile?.is_admin || false)
      }

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
        .select('id, url, latitude, longitude, is_verified, verification_count')
        .eq('crag_id', id)
        .not('latitude', 'is', null)
        .order('created_at', { ascending: false })

      if (imagesError) {
        console.error('Error fetching images:', imagesError)
      }

      if (!imagesData || imagesData.length === 0) {
        setCrag(cragData)
        setImages([])
        setLoading(false)
        return
      }

      const imageIds = imagesData.map(img => img.id)

      const { data: routeLinesData, error: rlError } = await supabase
        .from('route_lines')
        .select(`
          id,
          image_id,
          points,
          color,
          climb_id,
          climbs (
            id,
            name,
            grade,
            description,
            status
          )
        `)
        .in('image_id', imageIds)

      if (rlError) {
        console.error('Route lines error:', rlError)
      }

      const routeLinesMap = new Map()
      for (const rl of routeLinesData || []) {
        const existing = routeLinesMap.get(rl.image_id) || []
        existing.push(rl)
        routeLinesMap.set(rl.image_id, existing)
      }

      const formattedImages: ImageData[] = imagesData.map(img => {
        const routeLines = routeLinesMap.get(img.id) || []
        const validRouteLines = routeLines
          .filter((rl: RawRouteLine): rl is RawRouteLine & { climbs: NonNullable<RawRouteLine['climbs']> } => !!rl.climbs)
          .map((rl: RawRouteLine & { climbs: NonNullable<RawRouteLine['climbs']> }) => ({
            id: rl.id,
            points: rl.points,
            color: rl.color,
            climb: {
              id: rl.climbs.id,
              name: rl.climbs.name,
              grade: rl.climbs.grade,
              description: rl.climbs.description
            }
          }))

        return {
          id: img.id,
          url: img.url,
          latitude: img.latitude,
          longitude: img.longitude,
          is_verified: img.is_verified || false,
          verification_count: img.verification_count || 0,
          route_lines: validRouteLines
        }
      })

      setCrag(cragData)
      setImages(formattedImages)
      setLoading(false)
    }

    loadCrag()
  }, [params])

  useEffect(() => {
    if (!mapRef.current) return

    const center = crag?.boundary ? getPolygonCenter(crag.boundary) : null
    const viewCenter: [number, number] = center ? [center[0], center[1]] : [crag?.latitude ?? 0, crag?.longitude ?? 0]
    mapRef.current.setView(viewCenter, 14)
  }, [crag])

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

  const cragSchema = {
    "@context": "https://schema.org",
    "@type": "Place",
    "name": crag.name,
    "description": crag.description || `${crag.type || 'Bouldering'} crag in ${crag.regions?.name || 'Guernsey'}`,
    "url": `https://gsyrocks.com/crag/${crag.id}`,
    "address": {
      "@type": "PostalAddress",
      "addressLocality": crag.regions?.name || "Guernsey",
      "addressCountry": "GB"
    },
    "geo": {
      "@type": "GeoCoordinates",
      "latitude": crag.latitude,
      "longitude": crag.longitude
    },
    " amenityUsage": "Bouldering"
  } as Record<string, unknown>

  const additionalProperties: Record<string, unknown>[] = []
  if (crag.rock_type) {
    additionalProperties.push({
      "@type": "PropertyValue",
      "name": "rockType",
      "value": crag.rock_type
    })
  }

  if (crag.type) {
    additionalProperties.push({
      "@type": "PropertyValue",
      "name": "climbingType",
      "value": crag.type
    })
  }

  if (additionalProperties.length > 0) {
    cragSchema.additionalProperty = additionalProperties
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(cragSchema) }}
      />
      <div className="relative h-[50vh] bg-gray-200 dark:bg-gray-800">
        <MapContainer
          ref={mapRef as React.RefObject<L.Map | null>}
          center={[crag.latitude, crag.longitude]}
          zoom={14}
          style={{ height: '100%', width: '100%' }}
          zoomControl={false}
          scrollWheelZoom={true}
          whenReady={() => setMapReady(true)}
        >
          {mapReady && (
            <>
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

          {images.map(image => (
            <Marker
              key={image.id}
              position={[image.latitude || 0, image.longitude || 0]}
              icon={L?.divIcon({
                className: 'image-marker',
                html: `<div style="
                  background: ${image.is_verified ? '#22c55e' : '#eab308'};
                  width: 24px;
                  height: 24px;
                  border-radius: 50%;
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  color: white;
                  font-size: 11px;
                  font-weight: bold;
                  border: 2px solid white;
                  box-shadow: 0 2px 4px rgba(0,0,0,0.3);
                ">${image.route_lines.length}</div>`,
                iconSize: [24, 24],
                iconAnchor: [12, 12]
              })}
              eventHandlers={{
                click: (e: L.LeafletMouseEvent) => {
                  e.originalEvent.stopPropagation()
                },
              }}
            >
              <Popup
                closeButton={false}
                className="image-popup"
              >
                <div
                  className="w-40 cursor-pointer pt-1"
                  onClick={async () => {
                    const supabase = createClient()
                    const { data: { user } } = await supabase.auth.getUser()
                    if (!user) {
                      window.location.href = `/auth?redirect_to=/image/${image.id}`
                    } else {
                      window.location.href = `/image/${image.id}`
                    }
                  }}
                >
                  <div className="relative h-24 w-full mb-2 rounded overflow-hidden">
                      <Image
                        src={image.url}
                        alt="Routes"
                        fill
                        className="object-cover"
                        sizes="160px"
                      />
                    </div>
                  <p className="font-semibold text-sm text-gray-900">
                    {image.route_lines.length} route{image.route_lines.length !== 1 ? 's' : ''}
                  </p>
                  <p className={`text-xs ${image.is_verified ? 'text-green-600' : 'text-yellow-600'}`}>
                    {image.is_verified ? '✓ Verified' : `○ ${image.verification_count}/3 verified`}
                  </p>
                </div>
              </Popup>
            </Marker>
          ))}
          </>
          )}
        </MapContainer>

        <Link
          href="/map"
          className="absolute top-4 left-4 z-[1000] bg-white dark:bg-gray-800 rounded-lg px-3 py-2 text-sm font-medium shadow-md hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
        >
          ← Back to Map
        </Link>
      </div>

      <div className="max-w-4xl mx-auto p-6">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">{crag.name}</h1>
            {crag.regions && (
              <p className="text-lg text-gray-600 dark:text-gray-400">{crag.regions.name}</p>
            )}
          </div>
          {isAdmin && (
            <button
              onClick={() => setFlagModalOpen(true)}
              className="px-3 py-1.5 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-500 transition-colors"
            >
              🚩 Flag
            </button>
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
            <p className="font-medium text-gray-900 dark:text-gray-100">{images.reduce((sum, img) => sum + img.route_lines.length, 0)}</p>
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
                  <div
                    key={image.id}
                    className="block bg-white dark:bg-gray-800 rounded-lg overflow-hidden shadow-sm hover:shadow-md transition-shadow cursor-pointer"
                    onClick={async () => {
                      const supabase = createClient()
                      const { data: { user } } = await supabase.auth.getUser()
                      if (!user) {
                        window.location.href = `/auth?redirect_to=/image/${image.id}`
                      } else {
                        window.location.href = `/image/${image.id}`
                      }
                    }}
                  >
                    <div className="relative h-32 bg-gray-200 dark:bg-gray-700">
                      <Image
                        src={image.url}
                        alt="Route image"
                        fill
                        className="object-cover"
                        sizes="(max-width: 768px) 33vw, 25vw"
                      />
                      <div className="absolute bottom-2 right-2 bg-gray-900/80 text-white text-xs px-2 py-1 rounded-full">
                        {image.route_lines.length} routes
                      </div>
                      <div className={`absolute top-2 right-2 px-1.5 py-0.5 rounded text-xs font-medium ${
                        image.is_verified
                          ? 'bg-green-500 text-white'
                          : 'bg-yellow-500 text-white'
                      }`}>
                        {image.is_verified ? '✓' : `${image.verification_count}/3`}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
          )}
        </div>
      </div>

      {flagModalOpen && crag && (
        <FlagCragModal
          cragId={crag.id}
          cragName={crag.name}
          onClose={() => setFlagModalOpen(false)}
        />
      )}
    </div>
  )
}
