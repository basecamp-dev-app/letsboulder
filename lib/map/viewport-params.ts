const VIEWPORT_PARAMS = ['north', 'south', 'east', 'west', 'zoom'] as const

export interface ParsedViewport {
  north: number
  south: number
  east: number
  west: number
  zoom: number
}

export function parseViewportSearchParams(params: URLSearchParams): ParsedViewport | null {
  if ([...params.keys()].some((name) => !VIEWPORT_PARAMS.includes(name as typeof VIEWPORT_PARAMS[number]))) return null
  const suppliedCount = VIEWPORT_PARAMS.filter((name) => params.has(name)).length
  if (suppliedCount !== VIEWPORT_PARAMS.length
    || VIEWPORT_PARAMS.some((name) => params.getAll(name).length !== 1)) return null

  const rawValues = VIEWPORT_PARAMS.map((name) => params.get(name) ?? '')
  if (rawValues.some((value) => value.trim().length === 0)) return null

  const [north, south, east, west, zoom] = rawValues.map(Number)
  const longitudeSpan = west < east ? east - west : 360 - west + east
  const maximumHighZoomSpan = 10 / (2 ** Math.max(0, zoom - 12))

  if ([north, south, east, west, zoom].some((value) => !Number.isFinite(value))
    || north < -90 || north > 90 || south < -90 || south > 90
    || east < -180 || east > 180 || west < -180 || west > 180
    || north <= south || east === west
    || !Number.isInteger(zoom) || zoom < 0 || zoom > 22
    || (zoom >= 12 && (north - south > maximumHighZoomSpan || longitudeSpan > maximumHighZoomSpan))) return null

  return { north, south, east, west, zoom }
}
