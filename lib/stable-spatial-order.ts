export interface SpatialImageNode {
  displayImageId: string
  cragImageId?: string | null
  latitude: number | null
  longitude: number | null
  createdAt?: string | null
  sectorId?: string | null
  sectorName?: string | null
}

export interface SpatialImageStack {
  stackId: string
  latitude: number
  longitude: number
  images: SpatialImageNode[]
}

export interface StableSpatialOrderResult {
  orderedStacks: SpatialImageStack[]
  orderedImages: SpatialImageNode[]
  orderedImageIds: string[]
  stackIdByDisplayImageId: Map<string, string>
  imageIndexByDisplayImageId: Map<string, number>
}

const EARTH_RADIUS_METERS = 6371000
const STACK_EPSILON_METERS = 0.5

function toRadians(value: number) {
  return value * (Math.PI / 180)
}

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
  const dLat = toRadians(lat2 - lat1)
  const dLon = toRadians(lon2 - lon1)
  const fromLat = toRadians(lat1)
  const toLat = toRadians(lat2)

  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(fromLat) * Math.cos(toLat) * Math.sin(dLon / 2) ** 2

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

function compareSpatialNodes(a: SpatialImageNode, b: SpatialImageNode) {
  const createdAtDelta = compareCreatedAt(a.createdAt, b.createdAt)
  if (createdAtDelta !== 0) return createdAtDelta
  return a.displayImageId.localeCompare(b.displayImageId)
}

export function getStableSpatialOrder(nodes: SpatialImageNode[]): StableSpatialOrderResult {
  const validNodes = nodes
    .filter(
      (node): node is SpatialImageNode & { latitude: number; longitude: number } =>
        typeof node.latitude === 'number' && Number.isFinite(node.latitude)
        && typeof node.longitude === 'number' && Number.isFinite(node.longitude)
    )
    .sort(compareSpatialNodes)

  const nonSpatialNodes = nodes
    .filter((node) => !(typeof node.latitude === 'number' && Number.isFinite(node.latitude)
      && typeof node.longitude === 'number' && Number.isFinite(node.longitude)))
    .sort(compareSpatialNodes)

  const stacks: SpatialImageStack[] = []

  for (const node of validNodes) {
    let targetStack = stacks.find(
      (stack) => haversineMeters(stack.latitude, stack.longitude, node.latitude, node.longitude) < STACK_EPSILON_METERS
    )

    if (!targetStack) {
      targetStack = {
        stackId: `stack:${node.displayImageId}`,
        latitude: node.latitude,
        longitude: node.longitude,
        images: [],
      }
      stacks.push(targetStack)
    }

    targetStack.images.push(node)
  }

  for (const stack of stacks) {
    stack.images.sort(compareSpatialNodes)
  }

  const latitudes = validNodes.map((node) => node.latitude)
  const longitudes = validNodes.map((node) => node.longitude)
  const latSpan = latitudes.length > 0 ? Math.max(...latitudes) - Math.min(...latitudes) : 0
  const lonSpan = longitudes.length > 0 ? Math.max(...longitudes) - Math.min(...longitudes) : 0
  const isNorthSouth = latSpan > lonSpan

  stacks.sort((a, b) => {
    const aSector = a.images[0]?.sectorId || ''
    const bSector = b.images[0]?.sectorId || ''
    if (aSector !== bSector) return aSector.localeCompare(bSector)

    if (isNorthSouth) {
      if (a.latitude !== b.latitude) return b.latitude - a.latitude
      if (a.longitude !== b.longitude) return a.longitude - b.longitude
      return a.stackId.localeCompare(b.stackId)
    }

    if (a.longitude !== b.longitude) return a.longitude - b.longitude
    if (a.latitude !== b.latitude) return b.latitude - a.latitude
    return a.stackId.localeCompare(b.stackId)
  })

  const orderedImages = [...stacks.flatMap((stack) => stack.images), ...nonSpatialNodes]
  const orderedImageIds = orderedImages.map((image) => image.displayImageId)
  const stackIdByDisplayImageId = new Map<string, string>()
  const imageIndexByDisplayImageId = new Map<string, number>()

  for (const stack of stacks) {
    for (const image of stack.images) {
      stackIdByDisplayImageId.set(image.displayImageId, stack.stackId)
    }
  }

  orderedImages.forEach((image, index) => {
    imageIndexByDisplayImageId.set(image.displayImageId, index)
  })

  return {
    orderedStacks: stacks,
    orderedImages,
    orderedImageIds,
    stackIdByDisplayImageId,
    imageIndexByDisplayImageId,
  }
}
