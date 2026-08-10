export interface MapBounds {
  north: number
  south: number
  east: number
  west: number
}

export interface MapViewportQuery {
  bounds: MapBounds
  zoom: number
}

const LATITUDE_LIMIT = 85.05112878
const BOUNDS_PRECISION = 5
const QUERY_BOUNDS_PRECISION = 3
const MINIMUM_LATITUDE_SPAN = 0.00001

function normalizeLongitude(longitude: number) {
  const normalized = ((longitude + 180) % 360 + 360) % 360 - 180
  return normalized === -180 && longitude > 0 ? 180 : normalized
}

function roundCoordinate(value: number) {
  return Number(value.toFixed(BOUNDS_PRECISION))
}

function roundQueryCoordinate(value: number) {
  return Number(value.toFixed(QUERY_BOUNDS_PRECISION))
}

export function normalizeViewportQuery(viewport: MapViewportQuery): MapViewportQuery {
  return {
    zoom: Math.max(0, Math.floor(viewport.zoom)),
    bounds: {
      west: roundQueryCoordinate(viewport.bounds.west),
      south: roundQueryCoordinate(viewport.bounds.south),
      east: roundQueryCoordinate(viewport.bounds.east),
      north: roundQueryCoordinate(viewport.bounds.north),
    },
  }
}

export function normalizePaddedViewport(bounds: MapBounds, zoom: number): MapViewportQuery {
  const latitudePadding = Math.max(0, bounds.north - bounds.south) * 0.25
  let south = Math.max(-LATITUDE_LIMIT, Math.min(LATITUDE_LIMIT, bounds.south - latitudePadding))
  let north = Math.max(-LATITUDE_LIMIT, Math.min(LATITUDE_LIMIT, bounds.north + latitudePadding))
  if (north <= south) {
    if (north >= LATITUDE_LIMIT) south = LATITUDE_LIMIT - MINIMUM_LATITUDE_SPAN
    else north = -LATITUDE_LIMIT + MINIMUM_LATITUDE_SPAN
  }
  let longitudeSpan = bounds.east - bounds.west

  while (longitudeSpan < 0) longitudeSpan += 360

  if (longitudeSpan >= 240) {
    return {
      zoom: Math.max(0, Math.floor(zoom)),
      bounds: { west: -180, south: roundCoordinate(south), east: 180, north: roundCoordinate(north) },
    }
  }

  const longitudePadding = longitudeSpan * 0.25
  const paddedSpan = longitudeSpan + longitudePadding * 2
  const west = normalizeLongitude(bounds.west - longitudePadding)
  const east = normalizeLongitude(bounds.west - longitudePadding + paddedSpan)

  return {
    zoom: Math.max(0, Math.floor(zoom)),
    bounds: {
      west: roundCoordinate(west),
      south: roundCoordinate(south),
      east: roundCoordinate(east),
      north: roundCoordinate(north),
    },
  }
}
