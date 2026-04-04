import type { GpsData } from '@/types/domain'

type DmsValue = number | { numerator: number; denominator: number } | [number, number]

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

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function getField(data: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    if (key in data) return data[key]
  }
  return undefined
}

function toNumber(value: DmsValue): number | null {
  if (Array.isArray(value)) {
    if (value.length !== 2) return null
    const numerator = toFiniteNumber(value[0])
    const denominator = toFiniteNumber(value[1])
    if (numerator === null || denominator === null || denominator === 0) return null
    return numerator / denominator
  }

  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (!value || typeof value !== 'object') return null

  const objectValue = Object.fromEntries(Object.entries(value as object)) as Record<string, unknown>
  const numerator = toFiniteNumber(getField(objectValue, ['numerator', 'num', 'n']))
  const denominator = toFiniteNumber(getField(objectValue, ['denominator', 'den', 'd']))
  if (numerator === null || denominator === null || denominator === 0) return null
  return numerator / denominator
}

function toDmsArray(value: unknown): DmsValue[] | null {
  if (Array.isArray(value)) return value as DmsValue[]
  if (!value || typeof value !== 'object') return null

  const objectValue = value as Record<string, unknown>
  const degrees = getField(objectValue, ['degrees', 'degree', 'deg', 'd'])
  const minutes = getField(objectValue, ['minutes', 'minute', 'min', 'm'])
  const seconds = getField(objectValue, ['seconds', 'second', 'sec', 's'])
  if (degrees === undefined || minutes === undefined) return null
  return seconds === undefined ? [degrees as DmsValue, minutes as DmsValue] : [degrees as DmsValue, minutes as DmsValue, seconds as DmsValue]
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

function normalizeRef(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim().toUpperCase()
  return trimmed.length > 0 ? trimmed : null
}

function parseAsciiTag(view: DataView, valueOffset: number, count: number): string | null {
  if (count <= 0 || valueOffset < 0 || valueOffset + count > view.byteLength) return null
  const chars: number[] = []
  for (let i = 0; i < count; i += 1) {
    const code = view.getUint8(valueOffset + i)
    if (code === 0) break
    chars.push(code)
  }
  if (chars.length === 0) return null
  return String.fromCharCode(...chars).trim().toUpperCase()
}

function parseRationalArray(view: DataView, valueOffset: number, count: number, littleEndian: boolean): number[] | null {
  if (count <= 0 || valueOffset < 0 || valueOffset + count * 8 > view.byteLength) return null
  const numbers: number[] = []
  for (let i = 0; i < count; i += 1) {
    const numerator = view.getUint32(valueOffset + i * 8, littleEndian)
    const denominator = view.getUint32(valueOffset + i * 8 + 4, littleEndian)
    if (denominator === 0) return null
    numbers.push(numerator / denominator)
  }
  return numbers
}

export function isJpegBuffer(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 2) return false
  const bytes = new Uint8Array(buffer)
  return bytes[0] === 0xff && bytes[1] === 0xd8
}

export function parseGpsFromExifJpeg(buffer: ArrayBuffer): GpsData | null {
  const view = new DataView(buffer)
  if (view.byteLength < 4 || view.getUint16(0, false) !== 0xffd8) return null

  let cursor = 2
  while (cursor + 4 <= view.byteLength) {
    if (view.getUint8(cursor) !== 0xff) break
    const marker = view.getUint8(cursor + 1)
    cursor += 2
    if (marker === 0xd9 || marker === 0xda) break
    if (cursor + 2 > view.byteLength) break

    const segmentLength = view.getUint16(cursor, false)
    if (segmentLength < 2 || cursor + segmentLength > view.byteLength) break

    if (marker === 0xe1) {
      const segmentStart = cursor + 2
      const exifHeader = segmentStart + 6
      if (segmentStart + 6 <= view.byteLength && parseAsciiTag(view, segmentStart, 6) === 'EXIF') {
        if (exifHeader + 8 > view.byteLength) return null
        const byteOrderMark = String.fromCharCode(view.getUint8(exifHeader), view.getUint8(exifHeader + 1))
        const littleEndian = byteOrderMark === 'II'
        if (!littleEndian && byteOrderMark !== 'MM') return null

        const tiffStart = exifHeader
        if (view.getUint16(tiffStart + 2, littleEndian) !== 42) return null

        const ifd0Offset = view.getUint32(tiffStart + 4, littleEndian)
        const ifd0Start = tiffStart + ifd0Offset
        if (ifd0Start + 2 > view.byteLength) return null

        const entryCount = view.getUint16(ifd0Start, littleEndian)
        let gpsIfdOffset: number | null = null
        for (let i = 0; i < entryCount; i += 1) {
          const entryOffset = ifd0Start + 2 + i * 12
          if (entryOffset + 12 > view.byteLength) break
          if (view.getUint16(entryOffset, littleEndian) === 0x8825) {
            gpsIfdOffset = view.getUint32(entryOffset + 8, littleEndian)
            break
          }
        }
        if (gpsIfdOffset === null) return null

        const gpsIfdStart = tiffStart + gpsIfdOffset
        if (gpsIfdStart + 2 > view.byteLength) return null

        const gpsEntryCount = view.getUint16(gpsIfdStart, littleEndian)
        let latRef: string | null = null
        let lonRef: string | null = null
        let latValues: number[] | null = null
        let lonValues: number[] | null = null

        for (let i = 0; i < gpsEntryCount; i += 1) {
          const entryOffset = gpsIfdStart + 2 + i * 12
          if (entryOffset + 12 > view.byteLength) break

          const tag = view.getUint16(entryOffset, littleEndian)
          const fieldType = view.getUint16(entryOffset + 2, littleEndian)
          const count = view.getUint32(entryOffset + 4, littleEndian)
          const valueOrOffset = view.getUint32(entryOffset + 8, littleEndian)

          if (tag === 0x0001 && fieldType === 2) {
            const valueOffset = count <= 4 ? entryOffset + 8 : tiffStart + valueOrOffset
            latRef = parseAsciiTag(view, valueOffset, count)
            continue
          }

          if (tag === 0x0003 && fieldType === 2) {
            const valueOffset = count <= 4 ? entryOffset + 8 : tiffStart + valueOrOffset
            lonRef = parseAsciiTag(view, valueOffset, count)
            continue
          }

          if (tag === 0x0002 && fieldType === 5) {
            latValues = parseRationalArray(view, tiffStart + valueOrOffset, count, littleEndian)
            continue
          }

          if (tag === 0x0004 && fieldType === 5) {
            lonValues = parseRationalArray(view, tiffStart + valueOrOffset, count, littleEndian)
          }
        }

        if (!latValues || !lonValues || latValues.length < 2 || lonValues.length < 2) return null

        const lat = applyHemisphereSign(latValues[0] + latValues[1] / 60 + (latValues[2] || 0) / 3600, latRef, 'lat')
        const lon = applyHemisphereSign(lonValues[0] + lonValues[1] / 60 + (lonValues[2] || 0) / 3600, lonRef, 'lon')
        return isValidCoordinate(lat, lon) ? { latitude: lat, longitude: lon } : null
      }
    }

    cursor += segmentLength
  }

  return null
}

function arrayBufferToBinaryString(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let result = ''
  const chunkSize = 0x8000

  for (let i = 0; i < bytes.length; i += chunkSize) {
    result += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  }

  return result
}

export async function parseGpsWithPiexif(buffer: ArrayBuffer): Promise<GpsData | null> {
  try {
    const piexifModule = await import('piexifjs')
    const piexif = piexifModule.default || piexifModule
    const exif = piexif.load(arrayBufferToBinaryString(buffer)) as { GPS?: Record<string | number, unknown> }
    const gps = exif?.GPS
    if (!gps) return null

    const latRef = normalizeRef(gps[piexif.GPSIFD.GPSLatitudeRef])
    const lonRef = normalizeRef(gps[piexif.GPSIFD.GPSLongitudeRef])
    const latDms = toDmsArray(gps[piexif.GPSIFD.GPSLatitude])
    const lonDms = toDmsArray(gps[piexif.GPSIFD.GPSLongitude])
    if (!latDms || !lonDms) return null

    const latitude = convertDmsToDecimal(latDms, latRef || 'N')
    const longitude = convertDmsToDecimal(lonDms, lonRef || 'E')
    if (latitude === null || longitude === null) return null
    return isValidCoordinate(latitude, longitude) ? { latitude, longitude } : null
  } catch {
    return null
  }
}
