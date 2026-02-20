'use client'

import { useState, useRef, useCallback } from 'react'
import NextImage from 'next/image'
import type { NewImageSelection, GpsData } from '@/lib/submission-types'
import { blobToDataURL, isHeicFile } from '@/lib/image-utils'

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

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null
  }

  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return null
    if (!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(trimmed)) {
      return null
    }
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

async function extractGpsFromBuffer(buffer: ArrayBuffer): Promise<GpsData | null> {
  const exifr = (await import('exifr')).default

  try {
    const gpsData = await exifr.gps(buffer)
    const parsedGps = toGpsData(gpsData)
    if (parsedGps) {
      return parsedGps
    }
  } catch {
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
    const parsedGps = toGpsData(explicitTagData)
    if (parsedGps) return parsedGps
  } catch {
    // Ignore and try parse fallback below
  }

  try {
    const exifData = await exifr.parse(buffer, { tiff: true, exif: true, gps: true, xmp: true })
    const parsedGps = toGpsData(exifData)
    if (parsedGps) return parsedGps
  } catch {
    // Ignore and try full parse fallback below
  }

  try {
    const exifData = await exifr.parse(buffer)
    return toGpsData(exifData)
  } catch {
    return null
  }
}

async function extractGpsFromFile(file: File): Promise<GpsData | null> {
  try {
    const buffer = await file.arrayBuffer()
    return extractGpsFromBuffer(buffer)
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
  const [compressing, setCompressing] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  const processFile = async (selectedFile: File) => {
    onError('')
    setFile(null)
    setCompressedFile(null)
    setDetectedGpsData(null)
    setGpsDetectionComplete(false)

    if (!selectedFile.type.startsWith('image/') && !isHeicFile(selectedFile)) {
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
      let previewBlob: Blob | null = null

      if (isHeicFile(selectedFile)) {
        try {
          onUploading(true, 15, 'Loading HEIC preview...')
          previewBlob = await heicToJpegBlob(selectedFile)

          if (!gpsFromFile) {
            try {
              const previewBuffer = await previewBlob.arrayBuffer()
              gpsFromFile = await extractGpsFromBuffer(previewBuffer)
            } catch {
              // Ignore preview GPS fallback errors
            }
          }

          setDetectedGpsData(gpsFromFile)
          setGpsDetectionComplete(true)
          setPreviewUrl(URL.createObjectURL(previewBlob))
          onUploading(true, 20, 'Compressing HEIC...')
        } catch {
          onError('Failed to process HEIC image. Please convert to JPEG first.')
          onUploading(false, 0, '')
          return
        }
      } else {
        setDetectedGpsData(gpsFromFile)
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
        gpsData: detectedGpsData,
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
        accept="image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif,.heic,.heif"
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
                setDetectedGpsData(null)
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
