
'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import Image from 'next/image'
import { createClient } from '@/lib/supabase'
import { csrfFetch } from '@/hooks/useCsrf'
import Link from 'next/link'
import { geoJsonPolygonToLeaflet, getPolygonCenter } from '@/lib/geo-utils'
import type { GeoJSONPolygon } from '@/types/database'
import { SITE_URL } from '@/lib/site'

import 'leaflet/dist/leaflet.css'

function getAverageCoordinates(images: { latitude: number; longitude: number }[]): [number, number] {
  const totalLat = images.reduce((sum, img) => sum + img.latitude, 0)
  const totalLng = images.reduce((sum, img) => sum + img.longitude, 0)
  return [totalLat / images.length, totalLng / images.length]
}

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
  latitude: number | null
  longitude: number | null
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

function toRad(deg: number) {
  return (deg * Math.PI) / 180
}

function bearingDegrees(from: [number, number], to: [number, number]) {
  const [lat1, lon1] = from.map(toRad)
  const [lat2, lon2] = to.map(toRad)
  const dLon = lon2 - lon1
  const y = Math.sin(dLon) * Math.cos(lat2)
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon)
  const brng = (Math.atan2(y, x) * 180) / Math.PI
  return (brng + 360) % 360
}

function haversineMeters(from: [number, number], to: [number, number]) {
  const R = 6371000
  const [lat1, lon1] = from.map(toRad)
  const [lat2, lon2] = to.map(toRad)
  const dLat = lat2 - lat1
  const dLon = lon2 - lon1
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

export default function CragPage({ params }: { params: Promise<{ id: string }> }) {
  const [crag, setCrag] = useState<Crag | null>(null)
  const [images, setImages] = useState<ImageData[]>([])
  const [cragCenter, setCragCenter] = useState<[number, number] | null>(null)
  const [loading, setLoading] = useState(true)
  const [mapReady, setMapReady] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [isFlagging, setIsFlagging] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [highlightedImageId, setHighlightedImageId] = useState<string | null>(null)
  const mapRef = useRef<L.Map | null>(null)

  const imageCardRefs = useRef(new Map<string, HTMLDivElement>())

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

        const adminFromProfile = profile?.is_admin === true
        const hasAuthAdmin = user.app_metadata?.gsyrocks_admin === true
        setIsAdmin(adminFromProfile || hasAuthAdmin)
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
        setCragCenter(cragData.latitude && cragData.longitude ? [cragData.latitude, cragData.longitude] : null)
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
      const avgCoords = getAverageCoordinates(formattedImages.filter(img => img.latitude !== null && img.longitude !== null) as { latitude: number; longitude: number }[])
      setCragCenter(avgCoords)
      setLoading(false)
    }

    loadCrag()
  }, [params])

  useEffect(() => {
    if (!mapRef.current || !cragCenter) return

    const boundaryCenter = crag?.boundary ? getPolygonCenter(crag.boundary) : null
    const viewCenter: [number, number] = boundaryCenter ? [boundaryCenter[0], boundaryCenter[1]] : cragCenter
    mapRef.current.setView(viewCenter, 15)
  }, [crag, cragCenter])

  const handleFlagCrag = async (cragId: string) => {
    if (isFlagging) return
    setIsFlagging(true)
    setToast(null)

    try {
      const response = await csrfFetch(`/api/crags/${cragId}/flag`, {
        method: 'POST',
      })

      const data = await response.json()

      if (!response.ok) {
        setToast(data.error || 'Failed to flag crag')
        return
      }

      setToast('Crag flagged for review')
      setTimeout(() => setToast(null), 3000)
    } catch (error) {
      setToast('Failed to flag crag')
      setTimeout(() => setToast(null), 3000)
    } finally {
      setIsFlagging(false)
    }
  }

  const boundaryCoords = useMemo(() => {
    if (!crag?.boundary) return null
    return geoJsonPolygonToLeaflet(crag.boundary)
  }, [crag?.boundary])

  const viewCenter = useMemo<[number, number] | null>(() => {
    if (!cragCenter) return null
    const boundaryCenter = crag?.boundary ? getPolygonCenter(crag.boundary) : null
    return boundaryCenter ? [boundaryCenter[0], boundaryCenter[1]] : cragCenter
  }, [crag?.boundary, cragCenter])

  const orderedImages = useMemo(() => {
    if (!viewCenter) return images
    const withGeo = images
      .map((img) => {
        if (img.latitude == null || img.longitude == null) return null
        const pos: [number, number] = [img.latitude, img.longitude]
        return {
          img,
          bearing: bearingDegrees(viewCenter, pos),
          dist: haversineMeters(viewCenter, pos),
        }
      })
      .filter(Boolean) as Array<{ img: ImageData; bearing: number; dist: number }>

    withGeo.sort((a, b) => {
      if (a.bearing !== b.bearing) return a.bearing - b.bearing
      return a.dist - b.dist
    })

    const sorted = withGeo.map((x) => x.img)
    const missing = images.filter((img) => img.latitude == null || img.longitude == null)
    return [...sorted, ...missing]
  }, [images, viewCenter])

  const imageIndexById = useMemo(() => {
    const m = new Map<string, number>()
    orderedImages.forEach((img, idx) => m.set(img.id, idx + 1))
    return m
  }, [orderedImages])

  const totalRoutes = useMemo(() => {
    return images.reduce((sum, img) => sum + img.route_lines.length, 0)
  }, [images])

  const scrollToImageCard = useMemo(() => {
    return (imageId: string) => {
      if (typeof document === 'undefined') return
      const el = imageCardRefs.current.get(imageId) || document.getElementById(`crag-image-${imageId}`)
      if (!el) return
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      setHighlightedImageId(imageId)
      window.setTimeout(() => setHighlightedImageId((prev) => (prev === imageId ? null : prev)), 1400)
    }
  }, [])

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

  const cragSchema = {
    "@context": "https://schema.org",
    "@type": "Place",
    "name": crag.name,
    "description": crag.description || `${crag.type || 'Bouldering'} crag in ${crag.regions?.name || 'Guernsey'}`,
    "url": `${SITE_URL}/crag/${crag.id}`,
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
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-blue-600 text-white px-4 py-2 rounded-lg shadow-lg">
          {toast}
        </div>
      )}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(cragSchema) }}
      />
      <div className="relative h-[26vh] md:h-[50vh] bg-gray-200 dark:bg-gray-800">
        <MapContainer
          ref={mapRef as React.RefObject<L.Map | null>}
          center={cragCenter || [crag.latitude || 0, crag.longitude || 0]}
          zoom={15}
          style={{ height: '100%', width: '100%' }}
          zoomControl={false}
          scrollWheelZoom={true}
          whenReady={() => setMapReady(true)}
        >
          {mapReady && (
            <>
              <TileLayer
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
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

          {orderedImages.map((image) => (
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
                ">${imageIndexById.get(image.id) ?? ''}</div>`,
                iconSize: [24, 24],
                iconAnchor: [12, 12]
              })}
              eventHandlers={{
                click: (e: L.LeafletMouseEvent) => {
                  e.originalEvent.stopPropagation()
                  scrollToImageCard(image.id)
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
                    Image {imageIndexById.get(image.id) ?? ''}
                  </p>
                  <p className="text-xs text-gray-600">
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

        <div className="absolute top-4 left-4 z-[1000] bg-white/90 dark:bg-gray-800/90 rounded-lg px-3 py-2 text-sm font-semibold text-gray-900 dark:text-gray-100 shadow-md backdrop-blur">
          {crag.name}
        </div>

        {isAdmin && (
          <button
            onClick={() => handleFlagCrag(crag.id)}
            disabled={isFlagging}
            className="absolute top-4 right-4 z-[1000] px-3 py-2 bg-red-600 text-white text-sm font-semibold rounded-lg shadow-md hover:bg-red-500 disabled:opacity-50 transition-colors"
          >
            {isFlagging ? 'Flagging...' : '🚩 Flag'}
          </button>
        )}
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6">
        <div>
          {orderedImages.length === 0 ? (
            <p className="text-gray-500 dark:text-gray-400">No route images yet</p>
          ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {orderedImages.map((image) => (
                  <div
                    key={image.id}
                    id={`crag-image-${image.id}`}
                    ref={(el) => {
                      if (!el) return
                      imageCardRefs.current.set(image.id, el)
                    }}
                    className={`block bg-white dark:bg-gray-800 rounded-lg overflow-hidden shadow-sm hover:shadow-md transition-shadow cursor-pointer ring-2 ring-transparent ${
                      highlightedImageId === image.id ? 'ring-blue-400' : ''
                    }`}
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
                      <div className="absolute top-2 left-2 bg-white/90 text-gray-900 text-xs px-2 py-1 rounded-full font-semibold shadow-sm">
                        {imageIndexById.get(image.id) ?? ''}
                      </div>
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

        <div className="flex flex-wrap gap-2 mt-6 mb-6">
          {crag.type && (
            <span className="px-3 py-1 rounded-full text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100 capitalize">
              {crag.type}
            </span>
          )}
          {crag.rock_type && (
            <span className="px-3 py-1 rounded-full text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100 capitalize">
              {crag.rock_type}
            </span>
          )}
          <span className="px-3 py-1 rounded-full text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100 tabular-nums">
            {totalRoutes} routes
          </span>
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
      </div>
    </div>
  )
}
