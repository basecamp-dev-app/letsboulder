import type { GpsData } from '@/types/domain'

interface RationalLike {
  numerator: number
  denominator: number
}

type DmsValue = number | RationalLike | [number, number]

const MAX_GPS_SEARCH_DEPTH = 5
const MAX_GPS_VISITED_OBJECTS = 500

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null
  }

  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return null
    if (!/[0-9]/.test(trimmed)) return null
    const parsed = Number.parseFloat(trimmed)
    return Number.isFinite(parsed) ? parsed : null
  }

  return null
}

function parseDmsString(value: string, axis: 'lat' | 'lon', refOverride?: string | null): number | null {
  const normalized = value.trim().toUpperCase()
  if (!normalized) return null

  const decimal = toFiniteNumber(normalized)
  if (decimal !== null) {
    return applyHemisphereSign(decimal, refOverride || null, axis)
  }

  const refFromString = normalized.match(/[NSEW]/)?.[0] || null
  const numbers = normalized.match(/[+-]?\d+(?:\.\d+)?/g)
  if (!numbers || numbers.length < 2) return null

  const degrees = Number.parseFloat(numbers[0])
  const minutes = Number.parseFloat(numbers[1])
  const seconds = numbers.length > 2 ? Number.parseFloat(numbers[2]) : 0

  if (!Number.isFinite(degrees) || !Number.isFinite(minutes) || !Number.isFinite(seconds)) return null

  const base = Math.abs(degrees) + minutes / 60 + seconds / 3600
  const ref = refOverride || refFromString
  return applyHemisphereSign(base, ref, axis)
}

function parseCoordinatePairString(value: string, latRef: string | null, lonRef: string | null): GpsData | null {
  const normalized = value.trim().toUpperCase()
  if (!normalized) return null

  const iso6709Match = normalized.match(/^([+-]\d+(?:\.\d+)?)([+-]\d+(?:\.\d+)?)(?:[+-]\d+(?:\.\d+)?)?\/?$/)
  if (iso6709Match) {
    const latitude = toFiniteNumber(iso6709Match[1])
    const longitude = toFiniteNumber(iso6709Match[2])
    if (latitude !== null && longitude !== null && isValidCoordinate(latitude, longitude)) {
      return { latitude, longitude }
    }
  }

  const splitByPunctuation = normalized.split(/[;,]/).map((part) => part.trim()).filter(Boolean)
  if (splitByPunctuation.length >= 2) {
    const latitude = parseDmsString(splitByPunctuation[0], 'lat', latRef)
    const longitude = parseDmsString(splitByPunctuation[1], 'lon', lonRef)
    if (latitude !== null && longitude !== null && isValidCoordinate(latitude, longitude)) {
      return { latitude, longitude }
    }
  }

  const latRefIndex = normalized.search(/[NS]/)
  const lonRefIndex = normalized.search(/[EW]/)
  if (latRefIndex >= 0 && lonRefIndex > latRefIndex) {
    const latitudeText = normalized.slice(0, latRefIndex + 1).trim()
    const longitudeText = normalized.slice(latRefIndex + 1).trim()
    const latitude = parseDmsString(latitudeText, 'lat', latRef)
    const longitude = parseDmsString(longitudeText, 'lon', lonRef)
    if (latitude !== null && longitude !== null && isValidCoordinate(latitude, longitude)) {
      return { latitude, longitude }
    }
  }

  const decimalPairMatch = normalized.match(/([+-]?\d+(?:\.\d+)?)\s+([+-]?\d+(?:\.\d+)?)/)
  if (decimalPairMatch) {
    const latitude = applyHemisphereSign(Number.parseFloat(decimalPairMatch[1]), latRef, 'lat')
    const longitude = applyHemisphereSign(Number.parseFloat(decimalPairMatch[2]), lonRef, 'lon')
    if (isValidCoordinate(latitude, longitude)) {
      return { latitude, longitude }
    }
  }

  return null
}

function getField(data: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    if (key in data) {
      return data[key]
    }
  }

  const lowerCaseKeyLookup = new Map<string, string>()
  for (const key of Object.keys(data)) {
    lowerCaseKeyLookup.set(key.toLowerCase(), key)
  }

  for (const key of keys) {
    const actualKey = lowerCaseKeyLookup.get(key.toLowerCase())
    if (actualKey) {
      return data[actualKey]
    }
  }

  return undefined
}

function normalizeRef(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim().toUpperCase()
  return trimmed.length > 0 ? trimmed : null
}

function applyHemisphereSign(value: number, ref: string | null, axis: 'lat' | 'lon'): number {
  if (!ref) return value

  const negativeRef = axis === 'lat' ? ref === 'S' : ref === 'W'
  if (negativeRef) return -Math.abs(value)

  if (ref === 'N' || ref === 'E') return Math.abs(value)
  return value
}

function isValidCoordinate(latitude: number, longitude: number): boolean {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return false
  if (latitude < -90 || latitude > 90) return false
  if (longitude < -180 || longitude > 180) return false
  if (Math.abs(latitude) < 1e-9 && Math.abs(longitude) < 1e-9) return false
  return true
}

function toNumber(value: DmsValue): number | null {
  if (Array.isArray(value)) {
    if (value.length !== 2) return null
    const numerator = toFiniteNumber(value[0])
    const denominator = toFiniteNumber(value[1])
    if (numerator === null || denominator === null || denominator === 0) return null
    return numerator / denominator
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null
  }

  if (!value || typeof value !== 'object') return null

  if (!('numerator' in value) && !('denominator' in value)) return null

  const objectValue = Object.fromEntries(Object.entries(value as object)) as Record<string, unknown>
  const numerator = toFiniteNumber(getField(objectValue, ['numerator', 'num', 'n']))
  const denominator = toFiniteNumber(getField(objectValue, ['denominator', 'den', 'd']))
  if (numerator === null || denominator === null || denominator === 0) return null
  return numerator / denominator
}

function toDmsArray(value: unknown): DmsValue[] | null {
  if (Array.isArray(value)) {
    return value as DmsValue[]
  }

  if (!value || typeof value !== 'object') return null

  const objectValue = value as Record<string, unknown>
  const degrees = getField(objectValue, ['degrees', 'degree', 'deg', 'd'])
  const minutes = getField(objectValue, ['minutes', 'minute', 'min', 'm'])
  const seconds = getField(objectValue, ['seconds', 'second', 'sec', 's'])

  if (degrees === undefined || minutes === undefined) return null
  if (seconds === undefined) return [degrees as DmsValue, minutes as DmsValue]
  return [degrees as DmsValue, minutes as DmsValue, seconds as DmsValue]
}

function toCoordinate(value: unknown, axis: 'lat' | 'lon', ref: string | null): number | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const wrappedValue = value as Record<string, unknown>
    const unwrapped = getField(wrappedValue, ['computed', 'value', 'description'])
    if (unwrapped !== undefined && unwrapped !== value) {
      return toCoordinate(unwrapped, axis, ref)
    }
  }

  const numeric = toFiniteNumber(value)
  if (numeric !== null) {
    return applyHemisphereSign(numeric, ref, axis)
  }

  if (typeof value === 'string') {
    return parseDmsString(value, axis, ref)
  }

  const dms = toDmsArray(value)
  if (dms) {
    const fallbackRef = axis === 'lat' ? 'N' : 'E'
    return convertDmsToDecimal(dms, ref || fallbackRef)
  }

  return null
}

function readCoordinatesFromObject(data: Record<string, unknown>): GpsData | null {
  const latRef = normalizeRef(getField(data, ['GPSLatitudeRef', 'latitudeRef', 'latRef', 'refLatitude']))
  const lonRef = normalizeRef(getField(data, ['GPSLongitudeRef', 'longitudeRef', 'lonRef', 'lngRef', 'refLongitude']))

  const latitudeSources = [
    getField(data, ['latitude', 'lat', 'Latitude', 'GPSLatitudeDecimal', 'gpsLatitude', 'GPSLat', 'xmp:GPSLatitude']),
    getField(data, ['GPSLatitude', 'gpsLatitude', 'GPSLat'])
  ]
  const longitudeSources = [
    getField(data, ['longitude', 'lon', 'lng', 'Longitude', 'Long', 'GPSLongitudeDecimal', 'gpsLongitude', 'GPSLon', 'GPSLng', 'xmp:GPSLongitude']),
    getField(data, ['GPSLongitude', 'gpsLongitude', 'GPSLon', 'GPSLng'])
  ]

  for (const latSource of latitudeSources) {
    const latitude = toCoordinate(latSource, 'lat', latRef)
    if (latitude === null) continue

    for (const lonSource of longitudeSources) {
      const longitude = toCoordinate(lonSource, 'lon', lonRef)
      if (longitude === null) continue
      if (isValidCoordinate(latitude, longitude)) {
        return { latitude, longitude }
      }
    }
  }

  const gpsPosition = getField(data, ['GPSPosition', 'gpsPosition'])
  if (typeof gpsPosition === 'string') {
    const parsedPair = parseCoordinatePairString(gpsPosition, latRef, lonRef)
    if (parsedPair) {
      return parsedPair
    }
  }

  return null
}

function findCoordinatesDeep(value: unknown): GpsData | null {
  if (!value || typeof value !== 'object') return null

  const queue: Array<{ node: unknown; depth: number }> = [{ node: value, depth: 0 }]
  const visited = new Set<object>()

  while (queue.length > 0 && visited.size < MAX_GPS_VISITED_OBJECTS) {
    const current = queue.shift()!
    const { node, depth } = current
    if (!node || typeof node !== 'object') continue
    if (visited.has(node)) continue
    visited.add(node)

    const asRecord = node as Record<string, unknown>
    const directGps = readCoordinatesFromObject(asRecord)
    if (directGps) return directGps

    if (depth >= MAX_GPS_SEARCH_DEPTH) continue

    for (const nestedValue of Object.values(asRecord)) {
      if (nestedValue && typeof nestedValue === 'object') {
        queue.push({ node: nestedValue, depth: depth + 1 })
      }
    }
  }

  return null
}

function convertDmsToDecimal(dms: DmsValue[], ref: string): number | null {
  if (!dms || dms.length < 2) return null

  const degrees = toNumber(dms[0])
  const minutes = toNumber(dms[1])
  const seconds = dms.length > 2 ? toNumber(dms[2]) : 0

  if (degrees === null || minutes === null || seconds === null) return null

  const decimal = Math.abs(degrees) + minutes / 60 + seconds / 3600
  const axis: 'lat' | 'lon' = ref === 'E' || ref === 'W' ? 'lon' : 'lat'
  return applyHemisphereSign(decimal, ref, axis)
}

function toGpsData(value: unknown): GpsData | null {
  if (!value || typeof value !== 'object') return null

  const data = value as Record<string, unknown>

  const nestedGps = getField(data, ['gps', 'GPS', 'location', 'Location'])
  if (nestedGps && nestedGps !== value) {
    const nestedGpsData = toGpsData(nestedGps)
    if (nestedGpsData) return nestedGpsData
  }

  const directGps = readCoordinatesFromObject(data)
  if (directGps) return directGps

  return findCoordinatesDeep(data)
}

export {
  toGpsData,
  toFiniteNumber,
  parseDmsString,
  parseCoordinatePairString,
  getField,
  normalizeRef,
  applyHemisphereSign,
  isValidCoordinate,
  toNumber,
  toDmsArray,
  toCoordinate,
  readCoordinatesFromObject,
  findCoordinatesDeep,
  convertDmsToDecimal,
}
