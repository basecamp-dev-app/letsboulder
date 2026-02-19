'use client'

import { useState, useRef, useCallback } from 'react'
import NextImage from 'next/image'
import type { NewImageSelection, GpsData } from '@/lib/submission-types'
import { dataURLToBlob, blobToDataURL, isHeicFile } from '@/lib/image-utils'

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

type DmsValue = number | RationalLike

function toNumber(value: DmsValue): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null
  }

  if (!value || typeof value.numerator !== 'number' || typeof value.denominator !== 'number') {
    return null
  }

  if (!Number.isFinite(value.numerator) || !Number.isFinite(value.denominator) || value.denominator === 0) {
    return null
  }

  return value.numerator / value.denominator
}

function convertDmsToDecimal(dms: DmsValue[], ref: string): number | null {
  if (!dms || dms.length < 3) return null

  const degrees = toNumber(dms[0])
  const minutes = toNumber(dms[1])
  const seconds = toNumber(dms[2])

  if (degrees === null || minutes === null || seconds === null) return null

  let decimal = degrees + minutes / 60 + seconds / 3600

  if (ref === 'S' || ref === 'W') {
    decimal = -decimal
  }

  return decimal
}

function toGpsData(value: unknown): GpsData | null {
  if (!value || typeof value !== 'object') return null

  const data = value as {
    latitude?: unknown
    longitude?: unknown
    lat?: unknown
    lon?: unknown
    lng?: unknown
    GPSLatitude?: unknown
    GPSLongitude?: unknown
    GPSLatitudeRef?: unknown
    GPSLongitudeRef?: unknown
  }

  const latitude =
    (typeof data.latitude === 'number' && Number.isFinite(data.latitude) ? data.latitude : null) ??
    (typeof data.lat === 'number' && Number.isFinite(data.lat) ? data.lat : null)

  const longitude =
    (typeof data.longitude === 'number' && Number.isFinite(data.longitude) ? data.longitude : null) ??
    (typeof data.lon === 'number' && Number.isFinite(data.lon) ? data.lon : null) ??
    (typeof data.lng === 'number' && Number.isFinite(data.lng) ? data.lng : null)

  if (latitude !== null && longitude !== null) {
    return { latitude, longitude }
  }

  const gpsLat = Array.isArray(data.GPSLatitude) ? (data.GPSLatitude as DmsValue[]) : null
  const gpsLon = Array.isArray(data.GPSLongitude) ? (data.GPSLongitude as DmsValue[]) : null

  if (!gpsLat || !gpsLon) return null

  const latRef = typeof data.GPSLatitudeRef === 'string' ? data.GPSLatitudeRef : 'N'
  const lonRef = typeof data.GPSLongitudeRef === 'string' ? data.GPSLongitudeRef : 'W'

  const latDecimal = convertDmsToDecimal(gpsLat, latRef)
  const lonDecimal = convertDmsToDecimal(gpsLon, lonRef)

  if (latDecimal === null || lonDecimal === null) return null
  if (!Number.isFinite(latDecimal) || !Number.isFinite(lonDecimal)) return null

  return { latitude: latDecimal, longitude: lonDecimal }
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
    const exifData = await exifr.parse(buffer, { tiff: true, exif: true, gps: true })
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

      img.onload = () => {
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
        
        let quality = 0.9
        const targetSize = maxSizeMB * 1024 * 1024
        let compressedDataUrl: string | null = null
        
        const tryCompress = () => {
          compressedDataUrl = canvas.toDataURL('image/jpeg', quality)
          const blob = dataURLToBlob(compressedDataUrl)
          
          if (blob.size <= targetSize || quality <= 0.4) {
            const compressedFile = new File([blob], file.name.replace(/\.(heic|heif)$/i, '.jpg'), {
              type: 'image/jpeg',
              lastModified: Date.now()
            })
            resolve(compressedFile)
          } else {
            quality -= 0.1
            if (quality < 0.4) quality = 0.4
            tryCompress()
          }
        }
        
        tryCompress()
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
  const [compressing, setCompressing] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  const processFile = async (selectedFile: File) => {
    onError('')
    setFile(null)
    setCompressedFile(null)
    setDetectedGpsData(null)

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
          setPreviewUrl(URL.createObjectURL(previewBlob))
          onUploading(true, 20, 'Compressing HEIC...')
        } catch {
          onError('Failed to process HEIC image. Please convert to JPEG first.')
          onUploading(false, 0, '')
          return
        }
      } else {
        setDetectedGpsData(gpsFromFile)
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
      onError('Failed to compress image. Please try a different image.')
      setFile(null)
      onUploading(false, 0, '')
    } finally {
      setCompressing(false)
    }
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (!selectedFile) return

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
