'use client'

import { useCallback, useRef, useState } from 'react'
import L from 'leaflet'
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet'
import Image from 'next/image'
import { type ClusterableCragImage, type CragPinCluster } from '@/lib/crag-pin-clusters'

import 'leaflet/dist/leaflet.css'

interface LeafletIconDefault {
  prototype: {
    _getIconUrl?: () => void
  }
  mergeOptions: (options: Record<string, string>) => void
}

if (typeof window !== 'undefined') {
  delete (L.Icon.Default as unknown as LeafletIconDefault).prototype._getIconUrl
  ;(L.Icon.Default as unknown as LeafletIconDefault).mergeOptions({
    iconRetinaUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-blue.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
  })
}

function createClusterIcon(badgeNumber: number, isVerified: boolean) {
  return L.divIcon({
    className: 'image-marker',
    html: `<div style="
      background: ${isVerified ? '#22c55e' : '#eab308'};
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
    ">${badgeNumber}</div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  })
}

interface ClusteredImageData extends ClusterableCragImage {
  url: string
  is_verified: boolean
  verification_count: number
}

interface OrderedPinCluster extends CragPinCluster<ClusteredImageData> {
  badgeNumber: number
}

interface CragPageMapProps {
  cragName: string
  cragCenter: [number, number] | null
  cragLatitude: number | null
  cragLongitude: number | null
  orderedPinClusters: OrderedPinCluster[]
  imageById: Map<string, ClusteredImageData>
  onMarkerClick: (imageId: string) => void
}

export default function CragPageMap({
  cragName,
  cragCenter,
  cragLatitude,
  cragLongitude,
  orderedPinClusters,
  imageById,
  onMarkerClick,
}: CragPageMapProps) {
  const mapRef = useRef<L.Map | null>(null)
  const [mapReady, setMapReady] = useState(false)

  const handleMarkerClick = useCallback(
    (imageId: string) => {
      onMarkerClick(imageId)
    },
    [onMarkerClick]
  )

  return (
    <MapContainer
      ref={mapRef as React.RefObject<L.Map | null>}
      center={cragCenter || [cragLatitude || 0, cragLongitude || 0]}
      zoom={15}
      style={{ height: '100%', width: '100%' }}
      preferCanvas={true}
      zoomControl={false}
      scrollWheelZoom={true}
      whenReady={() => setMapReady(true)}
    >
      {mapReady && (
        <>
          <TileLayer
            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            attribution="Tiles © Esri"
            maxZoom={19}
          />

          {orderedPinClusters.map((cluster) => {
            const representativeImage = imageById.get(cluster.representativeImageId)
            if (!representativeImage) return null

            const clusterFaceLabel = `${cluster.faceCount} face${cluster.faceCount === 1 ? '' : 's'} here`
            const representativeRouteLabel = `${representativeImage.route_lines_count} route${representativeImage.route_lines_count === 1 ? '' : 's'} on this face`

            return (
              <Marker
                key={cluster.id}
                position={[cluster.latitude, cluster.longitude]}
                icon={createClusterIcon(cluster.badgeNumber, representativeImage.is_verified)}
              >
                <Popup closeButton={false} className="image-popup">
                  <div
                    className="w-40 cursor-pointer"
                    onClick={() => handleMarkerClick(representativeImage.id)}
                  >
                    <div className="relative h-24 w-full overflow-hidden rounded-md bg-gray-200 dark:bg-gray-700">
                      <Image
                        src={representativeImage.url}
                        alt={`${cragName} topo image ${cluster.badgeNumber}`.trim()}
                        fill
                        className="object-cover"
                        sizes="160px"
                        unoptimized
                      />
                      <div className="absolute top-2 left-2 rounded-full bg-white/90 px-2 py-1 text-xs font-semibold text-gray-900 shadow-sm">
                        {cluster.badgeNumber}
                      </div>
                      <div className="absolute bottom-2 right-2 rounded-full bg-gray-900/80 px-2 py-1 text-xs text-white">
                        {representativeImage.route_lines_count} routes
                      </div>
                      <div
                        className={`absolute top-2 right-2 rounded px-1.5 py-0.5 text-xs font-medium ${
                          representativeImage.is_verified
                            ? 'bg-green-500 text-white'
                            : 'bg-yellow-500 text-white'
                        }`}
                      >
                        {representativeImage.is_verified ? '✓' : `${representativeImage.verification_count}/3`}
                      </div>
                    </div>
                    <div className="space-y-1 px-1 pb-1 pt-2 text-left">
                      <div className="text-xs font-semibold text-stone-900 dark:text-stone-100">
                        {clusterFaceLabel}
                      </div>
                      <div className="text-[11px] text-stone-600 dark:text-stone-300">
                        {representativeRouteLabel}
                      </div>
                    </div>
                  </div>
                </Popup>
              </Marker>
            )
          })}
        </>
      )}
    </MapContainer>
  )
}
