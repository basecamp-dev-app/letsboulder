import type { GpsData } from '@/types/domain'
import { isJpegBuffer, parseGpsFromExifJpeg, parseGpsWithPiexif } from '@/lib/image-gps-exif'
import { toGpsData } from '@/lib/image-gps-coordinate-parser'

function gpsDebug(step: string, payload: unknown) {
  void step
  void payload
  return
}

function summarizeMetadata(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value

  const record = value as Record<string, unknown>
  const keys = Object.keys(record)
  const interestingKeys = keys.filter((key) => /gps|lat|lon|lng|location/i.test(key)).slice(0, 20)
  return {
    keyCount: keys.length,
    keys: keys.slice(0, 20),
    gpsLikeKeys: interestingKeys,
  }
}

async function extractGpsFromBlob(blob: Blob, debugLabel?: string): Promise<GpsData | null> {
  const exifr = (await import('exifr')).default

  try {
    const gpsData = await exifr.gps(blob)
    gpsDebug('exifr.gps(blob) raw', summarizeMetadata(gpsData))
    const parsedGps = toGpsData(gpsData)
    gpsDebug('exifr.gps(blob) parsed', parsedGps)
    if (parsedGps) return parsedGps
  } catch {
    gpsDebug('exifr.gps(blob) error', { file: debugLabel || 'unknown' })
  }

  try {
    const explicitTagData = await exifr.parse(blob, [
      'GPSLatitude',
      'GPSLongitude',
      'GPSLatitudeRef',
      'GPSLongitudeRef',
      'GPSPosition',
      'latitude',
      'longitude',
      'Latitude',
      'Longitude',
      'xmp:GPSLatitude',
      'xmp:GPSLongitude',
    ])
    gpsDebug('explicit tags(blob) raw', summarizeMetadata(explicitTagData))
    const parsedGps = toGpsData(explicitTagData)
    gpsDebug('explicit tags(blob) parsed', parsedGps)
    if (parsedGps) return parsedGps
  } catch {
    gpsDebug('explicit tags(blob) error', { file: debugLabel || 'unknown' })
  }

  try {
    const exifData = await exifr.parse(blob, { tiff: true, exif: true, gps: true, xmp: true })
    gpsDebug('structured parse(blob) raw', summarizeMetadata(exifData))
    const parsedGps = toGpsData(exifData)
    gpsDebug('structured parse(blob) parsed', parsedGps)
    if (parsedGps) return parsedGps
  } catch {
    gpsDebug('structured parse(blob) error', { file: debugLabel || 'unknown' })
  }

  return null
}

export async function extractGpsFromBuffer(buffer: ArrayBuffer, debugLabel?: string, mimeType?: string): Promise<GpsData | null> {
  const exifr = (await import('exifr')).default
  gpsDebug('start', { file: debugLabel || 'unknown', bytes: buffer.byteLength })

  try {
    const gpsData = await exifr.gps(buffer)
    gpsDebug('exifr.gps raw', summarizeMetadata(gpsData))
    const parsedGps = toGpsData(gpsData)
    gpsDebug('exifr.gps parsed', parsedGps)
    if (parsedGps) {
      return parsedGps
    }
  } catch {
    gpsDebug('exifr.gps error', { file: debugLabel || 'unknown' })
  }

  try {
    const explicitTagData = await exifr.parse(buffer, [
      'GPSLatitude',
      'GPSLongitude',
      'GPSLatitudeRef',
      'GPSLongitudeRef',
      'GPSPosition',
      'latitude',
      'longitude',
      'Latitude',
      'Longitude',
      'xmp:GPSLatitude',
      'xmp:GPSLongitude',
    ])
    gpsDebug('explicit tags raw', summarizeMetadata(explicitTagData))
    const parsedGps = toGpsData(explicitTagData)
    gpsDebug('explicit tags parsed', parsedGps)
    if (parsedGps) return parsedGps
  } catch {
    gpsDebug('explicit tags error', { file: debugLabel || 'unknown' })
  }

  try {
    const exifData = await exifr.parse(buffer, { tiff: true, exif: true, gps: true, xmp: true })
    gpsDebug('structured parse raw', summarizeMetadata(exifData))
    const parsedGps = toGpsData(exifData)
    gpsDebug('structured parse parsed', parsedGps)
    if (parsedGps) return parsedGps
  } catch {
    gpsDebug('structured parse error', { file: debugLabel || 'unknown' })
  }

  try {
    const exifData = await exifr.parse(buffer)
    gpsDebug('full parse raw', summarizeMetadata(exifData))
    const parsedGps = toGpsData(exifData)
    gpsDebug('full parse parsed', parsedGps)
    if (parsedGps) return parsedGps
  } catch {
    gpsDebug('full parse error', { file: debugLabel || 'unknown' })
  }

  const canUseJpegFallback = mimeType === 'image/jpeg' || mimeType === 'image/jpg' || isJpegBuffer(buffer)
  if (!canUseJpegFallback) return null

  try {
    const piexifGps = await parseGpsWithPiexif(buffer)
    gpsDebug('piexif parsed', piexifGps)
    if (piexifGps) return piexifGps
  } catch {
    gpsDebug('piexif fallback error', { file: debugLabel || 'unknown' })
  }

  try {
    const fallbackGps = parseGpsFromExifJpeg(buffer)
    gpsDebug('jpeg exif fallback parsed', fallbackGps)
    return fallbackGps
  } catch {
    gpsDebug('jpeg exif fallback error', { file: debugLabel || 'unknown' })
    return null
  }
}

export async function extractGpsFromFile(file: File): Promise<GpsData | null> {
  const debugLabel = `${file.name} (${file.type || 'unknown'})`

  try {
    const gpsFromBlob = await extractGpsFromBlob(file, debugLabel)
    if (gpsFromBlob) {
      gpsDebug('gps source selected', { source: 'original-blob', gps: gpsFromBlob })
      return gpsFromBlob
    }
  } catch {
    gpsDebug('extractGpsFromBlob error', { file: debugLabel })
  }

  try {
    const buffer = await file.arrayBuffer()
    const gpsFromBuffer = await extractGpsFromBuffer(buffer, debugLabel, file.type)
    if (gpsFromBuffer) {
      gpsDebug('gps source selected', { source: 'original-buffer', gps: gpsFromBuffer })
    }
    return gpsFromBuffer
  } catch {
    return null
  }
}
