import type { OfflineMapPin, OfflineTileManifest } from '@/lib/climb/queries'

const TILE_MIN_ZOOM = 15
const TILE_MAX_ZOOM = 17
const TILE_PADDING = 1

function clampLatitude(latitude: number) {
  return Math.min(85.05112878, Math.max(-85.05112878, latitude))
}

function longitudeToTileX(longitude: number, zoom: number) {
  const scale = 2 ** zoom
  return Math.floor(((longitude + 180) / 360) * scale)
}

function latitudeToTileY(latitude: number, zoom: number) {
  const scale = 2 ** zoom
  const radians = (clampLatitude(latitude) * Math.PI) / 180
  const mercator = Math.log(Math.tan(Math.PI / 4 + radians / 2))
  return Math.floor(((1 - mercator / Math.PI) / 2) * scale)
}

function normalizeTileIndex(index: number, zoom: number) {
  const maxIndex = 2 ** zoom - 1
  return Math.min(maxIndex, Math.max(0, index))
}

export function buildOfflineTileUrl(z: number, x: number, y: number) {
  return `/api/offline-tiles/${z}/${x}/${y}`
}

export function buildTileManifestForPins(pins: OfflineMapPin[]): OfflineTileManifest | null {
  if (pins.length === 0) return null

  const tileUrls = new Set<string>()

  for (let zoom = TILE_MIN_ZOOM; zoom <= TILE_MAX_ZOOM; zoom += 1) {
    const xValues = pins.map((pin) => longitudeToTileX(pin.longitude, zoom))
    const yValues = pins.map((pin) => latitudeToTileY(pin.latitude, zoom))

    const minX = normalizeTileIndex(Math.min(...xValues) - TILE_PADDING, zoom)
    const maxX = normalizeTileIndex(Math.max(...xValues) + TILE_PADDING, zoom)
    const minY = normalizeTileIndex(Math.min(...yValues) - TILE_PADDING, zoom)
    const maxY = normalizeTileIndex(Math.max(...yValues) + TILE_PADDING, zoom)

    for (let x = minX; x <= maxX; x += 1) {
      for (let y = minY; y <= maxY; y += 1) {
        tileUrls.add(buildOfflineTileUrl(zoom, x, y))
      }
    }
  }

  return {
    minZoom: TILE_MIN_ZOOM,
    maxZoom: TILE_MAX_ZOOM,
    tileCount: tileUrls.size,
    tileUrls: Array.from(tileUrls),
  }
}
