import { EARTH_RADIUS_METERS } from '@/lib/geo/haversine'

export interface ClusterableCragImage {
  id: string
  latitude: number | null
  longitude: number | null
  route_lines_count: number
  supplementary_faces_count: number
  created_at?: string | null
}

export interface CragPinCluster<TImage extends ClusterableCragImage = ClusterableCragImage> {
  id: string
  anchorImageId: string
  representativeImageId: string
  latitude: number
  longitude: number
  routeLinesCount: number
  faceCount: number
  images: TImage[]
}

interface ClusterBuildState<TImage extends ClusterableCragImage> {
  anchor: TImage
  images: TImage[]
}

function toRadians(value: number) {
  return value * (Math.PI / 180)
}

function haversineMeters(
  from: Pick<ClusterableCragImage, 'latitude' | 'longitude'>,
  to: Pick<ClusterableCragImage, 'latitude' | 'longitude'>
) {
  if (
    typeof from.latitude !== 'number'
    || typeof from.longitude !== 'number'
    || typeof to.latitude !== 'number'
    || typeof to.longitude !== 'number'
  ) {
    return Number.POSITIVE_INFINITY
  }

  const lat1 = toRadians(from.latitude)
  const lat2 = toRadians(to.latitude)
  const dLat = lat2 - lat1
  const dLng = toRadians(to.longitude - from.longitude)
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2

  return 2 * EARTH_RADIUS_METERS * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function compareCreatedAt(a: string | null | undefined, b: string | null | undefined) {
  if (a && b) {
    const delta = new Date(a).getTime() - new Date(b).getTime()
    if (!Number.isNaN(delta) && delta !== 0) return delta
  }

  if (a && !b) return -1
  if (!a && b) return 1
  return 0
}

function compareImages(a: ClusterableCragImage, b: ClusterableCragImage) {
  const createdAtDelta = compareCreatedAt(a.created_at, b.created_at)
  if (createdAtDelta !== 0) return createdAtDelta
  return a.id.localeCompare(b.id)
}

function pickRepresentativeImage<TImage extends ClusterableCragImage>(images: TImage[]) {
  return [...images].sort((a, b) => {
    if (a.route_lines_count !== b.route_lines_count) return b.route_lines_count - a.route_lines_count
    const createdAtDelta = compareCreatedAt(a.created_at, b.created_at)
    if (createdAtDelta !== 0) return createdAtDelta
    return a.id.localeCompare(b.id)
  })[0]
}

export function buildCragPinClusters<TImage extends ClusterableCragImage>(
  images: TImage[],
  radiusMeters = 6
): {
  clusters: Array<CragPinCluster<TImage>>
  clusterIdByImageId: Map<string, string>
} {
  const sortableImages = images
    .filter(
      (image): image is TImage & { latitude: number; longitude: number } =>
        typeof image.latitude === 'number' && Number.isFinite(image.latitude)
        && typeof image.longitude === 'number' && Number.isFinite(image.longitude)
    )
    .sort(compareImages)

  const clusterStates: Array<ClusterBuildState<TImage & { latitude: number; longitude: number }>> = []

  for (const image of sortableImages) {
    const matchingCluster = clusterStates.find((cluster) => haversineMeters(cluster.anchor, image) <= radiusMeters)
    if (matchingCluster) {
      matchingCluster.images.push(image)
      continue
    }

    clusterStates.push({
      anchor: image,
      images: [image],
    })
  }

  const clusterIdByImageId = new Map<string, string>()
  const clusters = clusterStates.map((cluster, index) => {
    const representativeImage = pickRepresentativeImage(cluster.images)
    const latitude = cluster.images.reduce((sum, image) => sum + image.latitude, 0) / cluster.images.length
    const longitude = cluster.images.reduce((sum, image) => sum + image.longitude, 0) / cluster.images.length
    const id = `cluster:${cluster.anchor.id}:${index + 1}`

    for (const image of cluster.images) {
      clusterIdByImageId.set(image.id, id)
    }

    return {
      id,
      anchorImageId: cluster.anchor.id,
      representativeImageId: representativeImage.id,
      latitude,
      longitude,
      routeLinesCount: cluster.images.reduce((sum, image) => sum + image.route_lines_count, 0),
      faceCount: cluster.images.length,
      images: [...cluster.images].sort(compareImages),
    }
  })

  return {
    clusters,
    clusterIdByImageId,
  }
}
