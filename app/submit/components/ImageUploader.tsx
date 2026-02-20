'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import NextImage from 'next/image'
import type { NewImageSelection, GpsData } from '@/lib/submission-types'
import { blobToDataURL, isHeicFile, isSupportedImageFile } from '@/lib/image-utils'

const ROUTE_UPLOADS_BUCKET = 'route-uploads'

interface ImageUploaderProps {
  onComplete: (result: NewImageSelection) => void
  onError: (error: string) => void
  onUploading: (uploading: boolean, progress: number, step: string) => void
}

interface RationalLike {
  numerator: number
  denominator: number
}

type DmsValue = number | RationalLike | [number, number]

const MAX_GPS_SEARCH_DEPTH = 5
const MAX_GPS_VISITED_OBJECTS = 500
const ENABLE_GPS_DEBUG = process.env.NODE_ENV === 'development'

function gpsDebug(step: string, payload: unknown) {
  if (!ENABLE_GPS_DEBUG) return
  console.log('[gps-extract]', step, payload)
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

  const objectValue = value as unknown as Record<string, unknown>
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

function isJpegBuffer(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 2) return false
  const bytes = new Uint8Array(buffer)
  return bytes[0] === 0xff && bytes[1] === 0xd8
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

function parseGpsFromExifJpeg(buffer: ArrayBuffer): GpsData | null {
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

          const tag = view.getUint16(entryOffset, littleEndian)
          if (tag === 0x8825) {
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

        if (!latValues || !lonValues || latValues.length < 2 || lonValues.length < 2) {
          return null
        }

        const lat = applyHemisphereSign(
          latValues[0] + latValues[1] / 60 + (latValues[2] || 0) / 3600,
          latRef,
          'lat'
        )
        const lon = applyHemisphereSign(
          lonValues[0] + lonValues[1] / 60 + (lonValues[2] || 0) / 3600,
          lonRef,
          'lon'
        )

        if (isValidCoordinate(lat, lon)) {
          return { latitude: lat, longitude: lon }
        }

        return null
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

async function parseGpsWithPiexif(buffer: ArrayBuffer, debugLabel?: string): Promise<GpsData | null> {
  try {
    const piexifModule = await import('piexifjs')
    const piexif = piexifModule.default || piexifModule
    const exif = piexif.load(arrayBufferToBinaryString(buffer)) as {
      GPS?: Record<string | number, unknown>
    }

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
    if (!isValidCoordinate(latitude, longitude)) return null

    return { latitude, longitude }
  } catch {
    gpsDebug('piexif error', { file: debugLabel || 'unknown' })
    return null
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

async function extractGpsFromBuffer(buffer: ArrayBuffer, debugLabel?: string, mimeType?: string): Promise<GpsData | null> {
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
    // Ignore and try parse fallback below
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
    // Ignore and try parse fallback below
  }

  try {
    const exifData = await exifr.parse(buffer, { tiff: true, exif: true, gps: true, xmp: true })
    gpsDebug('structured parse raw', summarizeMetadata(exifData))
    const parsedGps = toGpsData(exifData)
    gpsDebug('structured parse parsed', parsedGps)
    if (parsedGps) return parsedGps
  } catch {
    gpsDebug('structured parse error', { file: debugLabel || 'unknown' })
    // Ignore and try full parse fallback below
  }

  try {
    const exifData = await exifr.parse(buffer)
    gpsDebug('full parse raw', summarizeMetadata(exifData))
    const parsedGps = toGpsData(exifData)
    gpsDebug('full parse parsed', parsedGps)
    if (parsedGps) return parsedGps
  } catch {
    gpsDebug('full parse error', { file: debugLabel || 'unknown' })
    // Ignore and try JPEG EXIF fallback below
  }

  try {
    const exifReaderModule = await import('exifreader')
    const exifReader = exifReaderModule.default
    const exifReaderData = await Promise.resolve(exifReader.load(buffer, { expanded: true }))
    gpsDebug('exifreader raw', summarizeMetadata(exifReaderData))
    const parsedGps = toGpsData(exifReaderData)
    gpsDebug('exifreader parsed', parsedGps)
    if (parsedGps) return parsedGps
  } catch {
    gpsDebug('exifreader error', { file: debugLabel || 'unknown' })
    // Ignore and try JPEG EXIF fallback below
  }

  const canUseJpegFallback = mimeType === 'image/jpeg' || mimeType === 'image/jpg' || isJpegBuffer(buffer)
  if (!canUseJpegFallback) return null

  try {
    const piexifGps = await parseGpsWithPiexif(buffer, debugLabel)
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

async function extractGpsFromFile(file: File): Promise<GpsData | null> {
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

async function compressImageNative(file: File, maxSizeMB: number, maxWidthOrHeight: number, previewBlob: Blob | null = null): Promise<File> {
  let sourceData: string | ArrayBuffer | null = null

  if (isHeicFile(file)) {
    if (previewBlob) {
      sourceData = await blobToDataURL(previewBlob)
    } else {
      try {
        const jpegBlob = await heicToJpegBlob(file)
        sourceData = await blobToDataURL(jpegBlob)
      } catch {
        throw new Error('Failed to convert HEIC image. Please try a different file.')
      }
    }
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = (e) => {
      const img = new Image()
      const imgSrc = sourceData || (e.target?.result as string)

      img.onload = async () => {
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d')
        
        let { width, height } = img
        const maxDim = maxWidthOrHeight
        
        if (width > height) {
          if (width > maxDim) {
            height = Math.round((height * maxDim) / width)
            width = maxDim
          }
        } else {
          if (height > maxDim) {
            width = Math.round((width * maxDim) / height)
            height = maxDim
          }
        }
        
        canvas.width = width
        canvas.height = height
        ctx?.drawImage(img, 0, 0, width, height)

        try {
          let quality = 0.9
          const minQuality = 0.4
          const targetSize = maxSizeMB * 1024 * 1024

          while (quality >= minQuality) {
            const blob = await new Promise<Blob>((blobResolve, blobReject) => {
              canvas.toBlob(
                (nextBlob) => {
                  if (!nextBlob) {
                    blobReject(new Error('Failed to generate compressed image blob'))
                    return
                  }
                  blobResolve(nextBlob)
                },
                'image/jpeg',
                quality
              )
            })

            if (blob.size <= targetSize || quality === minQuality) {
              const compressedFile = new File([blob], file.name.replace(/\.(heic|heif)$/i, '.jpg'), {
                type: 'image/jpeg',
                lastModified: Date.now()
              })
              resolve(compressedFile)
              return
            }

            quality = Math.max(minQuality, Number((quality - 0.1).toFixed(2)))
          }

          reject(new Error('Failed to compress image'))
        } catch (error) {
          reject(error instanceof Error ? error : new Error('Failed to compress image'))
        }
      }
      
      img.onerror = () => {
        reject(new Error(`Failed to load image for compression. File type: ${file.type}`))
      }
      img.src = imgSrc
    }
    
    reader.onerror = () => {
      reject(new Error('Failed to read file'))
    }

    if (sourceData) {
      reader.onload({ target: { result: sourceData } } as ProgressEvent<FileReader>)
    } else {
      reader.readAsDataURL(file)
    }
  })
}

async function heicToJpegBlob(file: File): Promise<Blob> {
  const heic2any = (await import('heic2any')).default
  const blob = file instanceof Blob ? file : new Blob([file], { type: 'image/heic' })
  const jpegBlob = await heic2any({ blob, toType: 'image/jpeg', quality: 0.9 })
  return Array.isArray(jpegBlob) ? jpegBlob[0] : jpegBlob
}

async function getImageDimensions(url: string): Promise<{ width: number; height: number }> {
  const img = new Image()
  img.src = url
  await new Promise<void>((resolve) => {
    img.onload = () => resolve()
    img.onerror = () => resolve()
  })

  return {
    width: img.naturalWidth || 0,
    height: img.naturalHeight || 0,
  }
}

export default function ImageUploader({ onComplete, onError, onUploading }: ImageUploaderProps) {
  const [file, setFile] = useState<File | null>(null)
  const [compressedFile, setCompressedFile] = useState<File | null>(null)
  const [detectedGpsData, setDetectedGpsData] = useState<GpsData | null>(null)
  const [gpsDetectionComplete, setGpsDetectionComplete] = useState(false)
  const [isIosDevice, setIsIosDevice] = useState(false)
  const [compressing, setCompressing] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const detectedGpsRef = useRef<GpsData | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  const updateDetectedGps = useCallback((gps: GpsData | null) => {
    detectedGpsRef.current = gps
    setDetectedGpsData(gps)
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return

    const userAgent = window.navigator.userAgent
    const platform = window.navigator.platform || ''
    const isTouchMac = platform === 'MacIntel' && window.navigator.maxTouchPoints > 1
    const isIos = /iP(hone|ad|od)/.test(userAgent) || isTouchMac
    setIsIosDevice(isIos)
  }, [])

  const processFile = async (selectedFile: File) => {
    onError('')
    setFile(null)
    setCompressedFile(null)
    updateDetectedGps(null)
    setGpsDetectionComplete(false)

    if (!isSupportedImageFile(selectedFile)) {
      onError('Please select an image file (JPEG, PNG, WebP, HEIC, etc.)')
      return
    }

    const maxOriginalSize = 20 * 1024 * 1024
    if (selectedFile.size > maxOriginalSize) {
      onError(`File is too large (${(selectedFile.size / 1024 / 1024).toFixed(1)}MB). Maximum allowed: 20MB.`)
      return
    }

    try {
      onUploading(true, 10, 'Reading GPS metadata...')
      let gpsFromFile = await extractGpsFromFile(selectedFile)
      let gpsSource: 'original-file' | 'heic-preview' | 'none' = gpsFromFile ? 'original-file' : 'none'
      let previewBlob: Blob | null = null

      if (isHeicFile(selectedFile)) {
        try {
          onUploading(true, 15, 'Loading HEIC preview...')
          previewBlob = await heicToJpegBlob(selectedFile)

          if (!gpsFromFile) {
            try {
              const previewBuffer = await previewBlob.arrayBuffer()
              const gpsFromPreview = await extractGpsFromBuffer(previewBuffer, `${selectedFile.name} (preview-converted)`, previewBlob.type)
              if (gpsFromPreview) {
                gpsFromFile = gpsFromPreview
                gpsSource = 'heic-preview'
              }
            } catch {
              // Ignore preview GPS fallback errors
            }
          }

          gpsDebug('gps detection result', { file: selectedFile.name, source: gpsSource, gps: gpsFromFile })

          updateDetectedGps(gpsFromFile)
          setGpsDetectionComplete(true)
          setPreviewUrl(URL.createObjectURL(previewBlob))
          onUploading(true, 20, 'Compressing HEIC...')
        } catch {
          onError('Failed to process HEIC image. Please convert to JPEG first.')
          onUploading(false, 0, '')
          return
        }
      } else {
        gpsDebug('gps detection result', { file: selectedFile.name, source: gpsSource, gps: gpsFromFile })
        updateDetectedGps(gpsFromFile)
        setGpsDetectionComplete(true)
        setPreviewUrl(URL.createObjectURL(selectedFile))
        onUploading(true, 20, 'Compressing image...')
      }

      setFile(selectedFile)
      await compressImage(selectedFile, previewBlob)
    } catch (err) {
      console.error('Error processing file:', err)
      onError('Failed to process image. Please try a different file.')
      onUploading(false, 0, '')
    }
  }

  const compressImage = async (originalFile: File, previewBlob: Blob | null = null) => {
    try {
      setCompressing(true)
      onUploading(true, 20, 'Compressing image...')

      const compressed = await compressImageNative(originalFile, 0.3, 1200, previewBlob)

      setCompressedFile(compressed)
      onUploading(false, 0, '')

    } catch {
      setCompressedFile(null)
      onError('Could not compress image. We will upload the original file instead.')
      onUploading(false, 0, '')
    } finally {
      setCompressing(false)
    }
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (!selectedFile) return

    e.target.value = ''

    await processFile(selectedFile)
  }

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)

    const droppedFile = e.dataTransfer.files[0]
    if (!droppedFile) return

    await processFile(droppedFile)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const handleConfirm = async () => {
    const fileToUpload = compressedFile || file
    if (!fileToUpload) {
      onError('No image selected. Please upload an image first.')
      return
    }

    let finalGps = detectedGpsRef.current
    if (!finalGps && file) {
      finalGps = await extractGpsFromFile(file)
      updateDetectedGps(finalGps)
    }

    onUploading(true, 0, 'Uploading...')

    try {
      const { createClient } = await import('@/lib/supabase')
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        onError('Please log in to upload images')
        onUploading(false, 0, '')
        return
      }

      const fileName = `${user.id}/${Date.now()}-${fileToUpload.name}`
      onUploading(true, 20, 'Uploading image...')

      const { data, error: uploadError } = await supabase.storage
        .from(ROUTE_UPLOADS_BUCKET)
        .upload(fileName, fileToUpload)

      if (uploadError) {
        if (uploadError.message?.includes('size')) {
          onError('Image is too large. Please try a smaller image.')
        } else {
          onError(`Upload failed: ${uploadError.message}`)
        }
        onUploading(false, 0, '')
        return
      }

      onUploading(true, 50, 'Creating secure preview...')

      const { data: signedData, error: signedError } = await supabase.storage
        .from(ROUTE_UPLOADS_BUCKET)
        .createSignedUrl(data.path, 3600)

      if (signedError || !signedData?.signedUrl) {
        onError('Upload succeeded but preview failed. Please try again.')
        onUploading(false, 0, '')
        return
      }

      onUploading(true, 70, 'Getting image info...')
      const dimensions = await getImageDimensions(previewUrl || signedData.signedUrl)

      const result: NewImageSelection = {
        mode: 'new',
        file: fileToUpload,
        gpsData: finalGps,
        captureDate: null,
        width: dimensions.width,
        height: dimensions.height,
        naturalWidth: dimensions.width,
        naturalHeight: dimensions.height,
        uploadedBucket: ROUTE_UPLOADS_BUCKET,
        uploadedPath: data.path,
        uploadedUrl: signedData.signedUrl,
      }

      onUploading(false, 100, '')
      onComplete(result)

    } catch {
      onError('Failed to upload image. Please try again.')
      onUploading(false, 0, '')
    }
  }

  return (
    <div className="image-uploader">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,.heic,.heif,.HEIC,.HEIF"
        onChange={handleFileChange}
        disabled={compressing}
        className="hidden"
      />

      {previewUrl ? (
        <div className="space-y-4">
          <div className="relative h-48 rounded-lg overflow-hidden border border-gray-200 bg-gray-100 dark:border-gray-700 dark:bg-gray-800">
            <NextImage src={previewUrl} alt="Preview" fill unoptimized className="object-contain" sizes="100vw" />
            <button
              onClick={() => {
                setFile(null)
                setCompressedFile(null)
                updateDetectedGps(null)
                setGpsDetectionComplete(false)
                setPreviewUrl(null)
                if (fileInputRef.current) fileInputRef.current.value = ''
              }}
              className="absolute top-2 right-2 p-1 bg-black/50 text-white rounded-full hover:bg-black/70"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded">
            <p className="text-sm text-blue-700 dark:text-blue-300">
              By uploading, you confirm this is your photo of a climbing route, it does not contain people, and you have permission to share it.
            </p>
          </div>

          {gpsDetectionComplete && !detectedGpsData && (
            <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded">
              <p className="text-sm text-amber-700 dark:text-amber-300">
                No GPS metadata found in this file. Some apps remove location when sharing or exporting photos. You can place the pin manually in the next step.
              </p>
              {isIosDevice && (
                <p className="text-sm text-amber-700 dark:text-amber-300 mt-2">
                  On iPhone, Photos picker can remove location metadata from HEIF/JPEG files. If location is missing, place the pin manually in the next step.
                </p>
              )}
            </div>
          )}

          <button
            onClick={handleConfirm}
            disabled={compressing}
            className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {compressing ? 'Compressing...' : 'Upload Photo'}
          </button>
        </div>
      ) : (
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => fileInputRef.current?.click()}
          className={`
            border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-all duration-200
            ${isDragging
              ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
              : 'border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500'
            }
            ${compressing ? 'opacity-50 cursor-not-allowed' : ''}
          `}
        >
          <svg className={`w-12 h-12 mx-auto ${isDragging ? 'text-blue-500' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mt-2">
            {isDragging ? 'Drop image here' : 'Click or drag image to upload'}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            JPEG, PNG, HEIC, WebP, max 20MB
          </p>
        </div>
      )}
    </div>
  )
}
