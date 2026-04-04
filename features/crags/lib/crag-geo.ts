import { EARTH_RADIUS_METERS, toRad } from '@/lib/geo/haversine'
import type { ClusterableCragImage, CragPinCluster } from '@/lib/crag-pin-clusters'
import type { ImageData } from '@/features/crags/lib/crag-page-types'

const FACE_DIRECTIONS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const
const faceDirectionIndex = new Map(FACE_DIRECTIONS.map((direction, index) => [direction, index]))

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
  const [lat1, lon1] = from.map(toRad)
  const [lat2, lon2] = to.map(toRad)
  const dLat = lat2 - lat1
  const dLon = lon2 - lon1
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return EARTH_RADIUS_METERS * c
}

export function sortImagesByViewCenter(images: ImageData[], viewCenter: [number, number] | null) {
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
    .filter((value): value is { img: ImageData; bearing: number; dist: number } => value !== null)

  withGeo.sort((a, b) => {
    if (a.bearing !== b.bearing) return a.bearing - b.bearing
    return a.dist - b.dist
  })

  const sorted = withGeo.map((x) => x.img)
  const missing = images.filter((img) => img.latitude == null || img.longitude == null)
  return [...sorted, ...missing]
}

export function sortPinClusters<TImage extends ClusterableCragImage>(
  clusters: Array<CragPinCluster<TImage> & { badgeNumber: number }>,
  center: [number, number] | null
) {
  const sortable = [...clusters]

  sortable.sort((a, b) => {
    if (center) {
      const aBearing = bearingDegrees(center, [a.latitude, a.longitude])
      const bBearing = bearingDegrees(center, [b.latitude, b.longitude])
      if (aBearing !== bBearing) return aBearing - bBearing

      const aDistance = haversineMeters(center, [a.latitude, a.longitude])
      const bDistance = haversineMeters(center, [b.latitude, b.longitude])
      if (aDistance !== bDistance) return aDistance - bDistance
    }

    if (a.latitude !== b.latitude) return b.latitude - a.latitude
    if (a.longitude !== b.longitude) return a.longitude - b.longitude
    return a.id.localeCompare(b.id)
  })

  return sortable.map((cluster, index) => ({
    ...cluster,
    badgeNumber: index + 1,
  }))
}

export function getAverageCoordinates(images: { latitude: number; longitude: number }[]): [number, number] {
  const totalLat = images.reduce((sum, img) => sum + img.latitude, 0)
  const totalLng = images.reduce((sum, img) => sum + img.longitude, 0)
  return [totalLat / images.length, totalLng / images.length]
}

export function sortDirections(directions: string[]) {
  return [...new Set(directions.filter(Boolean))].sort((a, b) => {
    const aIndex = faceDirectionIndex.get(a as typeof FACE_DIRECTIONS[number])
    const bIndex = faceDirectionIndex.get(b as typeof FACE_DIRECTIONS[number])
    if (aIndex === undefined && bIndex === undefined) return a.localeCompare(b)
    if (aIndex === undefined) return 1
    if (bIndex === undefined) return -1
    return aIndex - bIndex
  })
}
