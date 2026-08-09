import type { GpsData } from '@/types/domain'
import { isJpegBuffer, parseGpsFromExifJpeg, parseGpsWithPiexif } from '@/lib/image-gps-exif'
import { toGpsData } from '@/lib/image-gps-coordinate-parser'
import { getImageDimensions } from '@/lib/image-dimensions'
import { reportImageGpsDiagnostic, type ImageGpsDiagnostic, type ImageGpsDiagnosticStage } from '@/lib/image-gps-diagnostics'

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

interface DiagnosticState extends Omit<ImageGpsDiagnostic, 'width' | 'height'> {
  width: number | null
  height: number | null
  stages: ImageGpsDiagnosticStage[]
}

function now(): number {
  return typeof performance === 'undefined' ? Date.now() : performance.now()
}

async function runParserStage<T>(
  name: string,
  work: () => Promise<T>,
  diagnostic: DiagnosticState | undefined,
  hasResult: (value: T) => boolean
): Promise<T> {
  const startedAt = now()
  try {
    const value = await work()
    diagnostic?.stages.push({ name, durationMs: now() - startedAt, outcome: hasResult(value) ? 'success' : 'empty' })
    return value
  } catch (error) {
    diagnostic?.stages.push({ name, durationMs: now() - startedAt, outcome: 'error', error: describeError(error) })
    throw error
  }
}

async function extractGpsFromBlob(blob: Blob, debugLabel?: string, diagnostic?: DiagnosticState): Promise<GpsData | null> {
  const exifr = (await import('exifr')).default

  try {
    const gpsData = await runParserStage('exifr.gps(blob)', () => exifr.gps(blob), diagnostic, (value) => value != null)
    const parsedGps = toGpsData(gpsData)
    if (parsedGps) {
      if (diagnostic) diagnostic.source = 'Blob'
      return parsedGps
    }
  } catch (error) {
    gpsDebug('exifr.gps(blob) error', debugContext(debugLabel, { error: describeError(error) }))
  }

  try {
    const explicitTagData = await runParserStage('explicit tags(blob)', () => exifr.parse(blob, [
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
    ]), diagnostic, (value) => value != null)
    const parsedGps = toGpsData(explicitTagData)
    if (parsedGps) {
      if (diagnostic) diagnostic.source = 'Blob'
      return parsedGps
    }
  } catch (error) {
    gpsDebug('explicit tags(blob) error', debugContext(debugLabel, { error: describeError(error) }))
  }

  try {
    const exifData = await runParserStage('structured parse(blob)', () => exifr.parse(blob, { tiff: true, exif: true, gps: true, xmp: true }), diagnostic, (value) => value != null)
    const parsedGps = toGpsData(exifData)
    if (parsedGps) {
      if (diagnostic) diagnostic.source = 'Blob'
      return parsedGps
    }
  } catch (error) {
    gpsDebug('structured parse(blob) error', debugContext(debugLabel, { error: describeError(error) }))
  }

  return null
}

export async function extractGpsFromBuffer(buffer: ArrayBuffer, debugLabel?: string, mimeType?: string, diagnostic?: DiagnosticState): Promise<GpsData | null> {
  const exifr = (await import('exifr')).default
  gpsDebug('start', debugContext(debugLabel, { bytes: buffer.byteLength, mimeType: mimeType || 'unknown' }))

  try {
    const gpsData = await runParserStage('exifr.gps(buffer)', () => exifr.gps(buffer), diagnostic, (value) => value != null)
    const parsedGps = toGpsData(gpsData)
    if (parsedGps) {
      if (diagnostic) diagnostic.source = 'buffer'
      return parsedGps
    }
  } catch (error) {
    gpsDebug('exifr.gps error', debugContext(debugLabel, { error: describeError(error) }))
  }

  try {
    const explicitTagData = await runParserStage('explicit tags(buffer)', () => exifr.parse(buffer, [
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
    ]), diagnostic, (value) => value != null)
    const parsedGps = toGpsData(explicitTagData)
    if (parsedGps) {
      if (diagnostic) diagnostic.source = 'buffer'
      return parsedGps
    }
  } catch (error) {
    gpsDebug('explicit tags error', debugContext(debugLabel, { error: describeError(error) }))
  }

  try {
    const exifData = await runParserStage('structured parse(buffer)', () => exifr.parse(buffer, { tiff: true, exif: true, gps: true, xmp: true }), diagnostic, (value) => value != null)
    const parsedGps = toGpsData(exifData)
    if (parsedGps) {
      if (diagnostic) diagnostic.source = 'buffer'
      return parsedGps
    }
  } catch (error) {
    gpsDebug('structured parse error', debugContext(debugLabel, { error: describeError(error) }))
  }

  try {
    const exifData = await runParserStage('full parse(buffer)', () => exifr.parse(buffer), diagnostic, (value) => value != null)
    const parsedGps = toGpsData(exifData)
    if (parsedGps) {
      if (diagnostic) diagnostic.source = 'buffer'
      return parsedGps
    }
  } catch (error) {
    gpsDebug('full parse error', debugContext(debugLabel, { error: describeError(error) }))
  }

  const canUseJpegFallback = mimeType === 'image/jpeg' || mimeType === 'image/jpg' || isJpegBuffer(buffer)
  if (!canUseJpegFallback) return null

  try {
    const piexifGps = await runParserStage('piexif fallback', () => parseGpsWithPiexif(buffer), diagnostic, (value) => value != null)
    if (piexifGps) {
      if (diagnostic) diagnostic.source = 'fallback'
      return piexifGps
    }
  } catch (error) {
    gpsDebug('piexif fallback error', debugContext(debugLabel, { error: describeError(error) }))
  }

  try {
    const fallbackGps = await runParserStage('jpeg exif fallback', async () => parseGpsFromExifJpeg(buffer), diagnostic, (value) => value != null)
    if (fallbackGps && diagnostic) diagnostic.source = 'fallback'
    return fallbackGps
  } catch (error) {
    gpsDebug('jpeg exif fallback error', debugContext(debugLabel, { error: describeError(error) }))
    return null
  }
}

export async function extractGpsFromFile(file: File): Promise<GpsData | null> {
  const debugLabel = `${file.name} (${file.type || 'unknown'})`
  const fileContext = { size: file.size, lastModified: file.lastModified }
  const diagnosticsEnabled = process.env.NEXT_PUBLIC_DEBUG_IMAGE_GPS === 'true'
  const diagnostic: DiagnosticState | undefined = diagnosticsEnabled ? {
    fileName: file.name,
    mimeType: file.type || 'unknown',
    size: file.size,
    width: null,
    height: null,
    userAgent: typeof navigator === 'undefined' ? 'unknown' : navigator.userAgent,
    arrayBuffer: { success: false, byteLength: null },
    stages: [],
    source: 'none',
  } : undefined

  if (diagnostic) {
    try {
      const dimensions = await getImageDimensions(file)
      diagnostic.width = dimensions.width
      diagnostic.height = dimensions.height
    } catch {
      // Dimensions are diagnostic-only and must not affect GPS extraction.
    }
  }

  const arrayBufferStartedAt = now()
  try {
    const buffer = await file.arrayBuffer()
    if (diagnostic) {
      diagnostic.arrayBuffer = { success: true, byteLength: buffer.byteLength }
      diagnostic.stages.push({ name: 'arrayBuffer()', durationMs: now() - arrayBufferStartedAt, outcome: 'success' })
    }
    gpsDebug('arrayBuffer ready', debugContext(debugLabel, fileContext))
    const gpsFromBuffer = await extractGpsFromBuffer(buffer, debugLabel, file.type, diagnostic)
    if (gpsFromBuffer) {
      gpsDebug('gps source selected', debugContext(debugLabel, { ...fileContext, source: 'original-buffer' }))
      if (diagnostic) reportImageGpsDiagnostic(diagnostic)
      return gpsFromBuffer
    }
  } catch (error) {
    diagnostic?.stages.push({ name: 'arrayBuffer()', durationMs: now() - arrayBufferStartedAt, outcome: 'error', error: describeError(error) })
    gpsDebug('arrayBuffer extraction error', debugContext(debugLabel, { ...fileContext, error: describeError(error) }))
  }

  try {
    const gpsFromBlob = await extractGpsFromBlob(file, debugLabel, diagnostic)
    if (gpsFromBlob) {
      gpsDebug('gps source selected', debugContext(debugLabel, { ...fileContext, source: 'original-blob' }))
      if (diagnostic) reportImageGpsDiagnostic(diagnostic)
      return gpsFromBlob
    }
  } catch (error) {
    gpsDebug('extractGpsFromBlob error', debugContext(debugLabel, { ...fileContext, error: describeError(error) }))
  }

  gpsDebug('gps not found', debugContext(debugLabel, fileContext))
  if (diagnostic) reportImageGpsDiagnostic(diagnostic)
  return null
}
