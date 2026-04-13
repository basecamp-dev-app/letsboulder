import type { OfflineMapPin, OfflineTileManifest } from '@/features/climb/lib/queries'

const TILE_MIN_ZOOM = 14
const TILE_MAX_ZOOM = 17
const TILE_PADDING_BY_ZOOM: Record<number, number> = {
  14: 0,
  15: 1,
  16: 1,
  17: 1,
}
const MAX_TILES_PER_ZOOM = 4096
const MAX_TOTAL_TILES = 8192

function isValidPinCoordinate(value: number, min: number, max: number) {
  return Number.isFinite(value) && value >= min && value <= max
}

function isValidOfflineMapPin(pin: OfflineMapPin) {
  return isValidPinCoordinate(pin.latitude, -85.05112878, 85.05112878)
    && isValidPinCoordinate(pin.longitude, -180, 180)
}

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

export function buildOfflineTileUrl(z: number, x: number, y: number, layer: 'imagery' | 'labels' = 'imagery') {
  return `/api/offline-tiles/${layer}/${z}/${x}/${y}`
}

export function buildTileManifestForPins(pins: OfflineMapPin[]): OfflineTileManifest | null {
  const validPins = pins.filter(isValidOfflineMapPin)
  if (validPins.length === 0) return null

  const imageryTileUrls = new Set<string>()
  const labelsTileUrls = new Set<string>()

  for (let zoom = TILE_MIN_ZOOM; zoom <= TILE_MAX_ZOOM; zoom += 1) {
    const tilePadding = TILE_PADDING_BY_ZOOM[zoom] ?? 1
    const xValues = validPins.map((pin) => longitudeToTileX(pin.longitude, zoom))
    const yValues = validPins.map((pin) => latitudeToTileY(pin.latitude, zoom))

    const minX = normalizeTileIndex(Math.min(...xValues) - tilePadding, zoom)
    const maxX = normalizeTileIndex(Math.max(...xValues) + tilePadding, zoom)
    const minY = normalizeTileIndex(Math.min(...yValues) - tilePadding, zoom)
    const maxY = normalizeTileIndex(Math.max(...yValues) + tilePadding, zoom)

    const tileCountForZoom = (maxX - minX + 1) * (maxY - minY + 1)
    if (!Number.isFinite(tileCountForZoom) || tileCountForZoom <= 0 || tileCountForZoom > MAX_TILES_PER_ZOOM) {
      return null
    }

    if (imageryTileUrls.size + labelsTileUrls.size + tileCountForZoom * 2 > MAX_TOTAL_TILES) {
      return null
    }

    for (let x = minX; x <= maxX; x += 1) {
      for (let y = minY; y <= maxY; y += 1) {
        imageryTileUrls.add(buildOfflineTileUrl(zoom, x, y, 'imagery'))
        labelsTileUrls.add(buildOfflineTileUrl(zoom, x, y, 'labels'))
      }
    }
  }

  return {
    minZoom: TILE_MIN_ZOOM,
    maxZoom: TILE_MAX_ZOOM,
    tileCount: imageryTileUrls.size + labelsTileUrls.size,
    tileUrls: [...imageryTileUrls, ...labelsTileUrls],
    imageryTileUrls: Array.from(imageryTileUrls),
    labelsTileUrls: Array.from(labelsTileUrls),
  }
}
