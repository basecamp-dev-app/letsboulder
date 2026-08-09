import type { GpsData } from '@/types/domain'
import { isJpegBuffer, parseGpsFromExifJpeg, parseGpsWithPiexif } from '@/lib/image-gps-exif'
import { toGpsData } from '@/lib/image-gps-coordinate-parser'

function gpsDebug(step: string, payload: unknown) {
  if (process.env.NEXT_PUBLIC_DEBUG_IMAGE_GPS !== 'true') return
  // Diagnostics are temporary and opt-in because image metadata can be sensitive.
  // eslint-disable-next-line no-console
  console.warn('[image-gps]', { step, ...payload as Record<string, unknown> })
}

function describeError(error: unknown): { name: string; message: string } {
  if (error instanceof Error) return { name: error.name, message: error.message }
  return { name: 'UnknownError', message: String(error) }
}

function debugContext(debugLabel: string | undefined, extra: Record<string, unknown> = {}) {
  return {
    file: debugLabel || 'unknown',
    userAgent: typeof navigator === 'undefined' ? 'unknown' : navigator.userAgent,
    ...extra,
  }
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
    gpsDebug('exifr.gps(blob) parsed', summarizeMetadata(parsedGps))
    if (parsedGps) return parsedGps
  } catch (error) {
    gpsDebug('exifr.gps(blob) error', debugContext(debugLabel, { error: describeError(error) }))
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
    gpsDebug('explicit tags(blob) parsed', summarizeMetadata(parsedGps))
    if (parsedGps) return parsedGps
  } catch (error) {
    gpsDebug('explicit tags(blob) error', debugContext(debugLabel, { error: describeError(error) }))
  }

  try {
    const exifData = await exifr.parse(blob, { tiff: true, exif: true, gps: true, xmp: true })
    gpsDebug('structured parse(blob) raw', summarizeMetadata(exifData))
    const parsedGps = toGpsData(exifData)
    gpsDebug('structured parse(blob) parsed', summarizeMetadata(parsedGps))
    if (parsedGps) return parsedGps
  } catch (error) {
    gpsDebug('structured parse(blob) error', debugContext(debugLabel, { error: describeError(error) }))
  }

  return null
}

export async function extractGpsFromBuffer(buffer: ArrayBuffer, debugLabel?: string, mimeType?: string): Promise<GpsData | null> {
  const exifr = (await import('exifr')).default
  gpsDebug('start', debugContext(debugLabel, { bytes: buffer.byteLength, mimeType: mimeType || 'unknown' }))

  try {
    const gpsData = await exifr.gps(buffer)
    gpsDebug('exifr.gps raw', summarizeMetadata(gpsData))
    const parsedGps = toGpsData(gpsData)
    gpsDebug('exifr.gps parsed', summarizeMetadata(parsedGps))
    if (parsedGps) {
      return parsedGps
    }
  } catch (error) {
    gpsDebug('exifr.gps error', debugContext(debugLabel, { error: describeError(error) }))
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
    gpsDebug('explicit tags parsed', summarizeMetadata(parsedGps))
    if (parsedGps) return parsedGps
  } catch (error) {
    gpsDebug('explicit tags error', debugContext(debugLabel, { error: describeError(error) }))
  }

  try {
    const exifData = await exifr.parse(buffer, { tiff: true, exif: true, gps: true, xmp: true })
    gpsDebug('structured parse raw', summarizeMetadata(exifData))
    const parsedGps = toGpsData(exifData)
    gpsDebug('structured parse parsed', summarizeMetadata(parsedGps))
    if (parsedGps) return parsedGps
  } catch (error) {
    gpsDebug('structured parse error', debugContext(debugLabel, { error: describeError(error) }))
  }

  try {
    const exifData = await exifr.parse(buffer)
    gpsDebug('full parse raw', summarizeMetadata(exifData))
    const parsedGps = toGpsData(exifData)
    gpsDebug('full parse parsed', summarizeMetadata(parsedGps))
    if (parsedGps) return parsedGps
  } catch (error) {
    gpsDebug('full parse error', debugContext(debugLabel, { error: describeError(error) }))
  }

  const canUseJpegFallback = mimeType === 'image/jpeg' || mimeType === 'image/jpg' || isJpegBuffer(buffer)
  if (!canUseJpegFallback) return null

  try {
    const piexifGps = await parseGpsWithPiexif(buffer)
    gpsDebug('piexif parsed', summarizeMetadata(piexifGps))
    if (piexifGps) return piexifGps
  } catch (error) {
    gpsDebug('piexif fallback error', debugContext(debugLabel, { error: describeError(error) }))
  }

  try {
    const fallbackGps = parseGpsFromExifJpeg(buffer)
    gpsDebug('jpeg exif fallback parsed', summarizeMetadata(fallbackGps))
    return fallbackGps
  } catch (error) {
    gpsDebug('jpeg exif fallback error', debugContext(debugLabel, { error: describeError(error) }))
    return null
  }
}

export async function extractGpsFromFile(file: File): Promise<GpsData | null> {
  const debugLabel = `${file.name} (${file.type || 'unknown'})`
  const fileContext = { size: file.size, lastModified: file.lastModified }

  try {
    const buffer = await file.arrayBuffer()
    gpsDebug('arrayBuffer ready', debugContext(debugLabel, fileContext))
    const gpsFromBuffer = await extractGpsFromBuffer(buffer, debugLabel, file.type)
    if (gpsFromBuffer) {
      gpsDebug('gps source selected', debugContext(debugLabel, { ...fileContext, source: 'original-buffer' }))
      return gpsFromBuffer
    }
  } catch (error) {
    gpsDebug('arrayBuffer extraction error', debugContext(debugLabel, { ...fileContext, error: describeError(error) }))
  }

  try {
    const gpsFromBlob = await extractGpsFromBlob(file, debugLabel)
    if (gpsFromBlob) {
      gpsDebug('gps source selected', debugContext(debugLabel, { ...fileContext, source: 'original-blob' }))
      return gpsFromBlob
    }
  } catch (error) {
    gpsDebug('extractGpsFromBlob error', debugContext(debugLabel, { ...fileContext, error: describeError(error) }))
  }

  gpsDebug('gps not found', debugContext(debugLabel, fileContext))
  return null
}
