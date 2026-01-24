'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import LocationConfirmModal from '@/components/LocationConfirmModal'
import { trackUploadStarted, trackUploadCompleted } from '@/lib/posthog'

async function compressImageNative(file: File, maxSizeMB: number, maxWidthOrHeight: number): Promise<File> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    
    reader.onload = (e) => {
      const img = new Image()
      
      img.onload = () => {
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d')
        
        // Calculate new dimensions
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
        
        // Compress to target size
        let quality = 0.9
        const targetSize = maxSizeMB * 1024 * 1024
        let compressedDataUrl: string | null = null
        
        const tryCompress = () => {
          compressedDataUrl = canvas.toDataURL('image/jpeg', quality)
          const blob = dataURLToBlob(compressedDataUrl)
          
          if (blob.size <= targetSize || quality <= 0.4) {
            const compressedFile = new File([blob], file.name, {
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
      
      img.onerror = () => reject(new Error('Failed to load image for compression'))
      img.src = e.target?.result as string
    }
    
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsDataURL(file)
  })
}

function dataURLToBlob(dataURL: string): Blob {
  const arr = dataURL.split(',')
  const mime = arr[0].match(/:(.*?);/)?.[1] || 'image/jpeg'
  const bstr = atob(arr[1])
  let n = bstr.length
  const u8arr = new Uint8Array(n)
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n)
  }
  return new Blob([u8arr], { type: mime })
}

async function extractGpsFromFile(file: File): Promise<{ latitude: number; longitude: number } | null> {
  try {
    const exifr = (await import('exifr')).default
    const buffer = await file.arrayBuffer()
    const exifData = await exifr.parse(buffer, { tiff: true, exif: true, gps: true })

    if (exifData?.latitude && exifData?.longitude) {
      return { latitude: exifData.latitude, longitude: exifData.longitude }
    }

    if (exifData?.GPSLatitude && exifData?.GPSLongitude) {
      const parseDmsRational = (arr: number[]): number => {
        if (!arr || arr.length < 6) return 0
        return (arr[0] / arr[1]) + (arr[2] / arr[3]) / 60 + (arr[4] / arr[5]) / 3600
      }

      const latRef = (exifData.GPSLatitudeRef as string) || 'N'
      const lngRef = (exifData.GPSLongitudeRef as string) || 'E'

      const latMultiplier = latRef.includes('S') ? -1 : 1
      const lngMultiplier = lngRef.includes('W') ? -1 : 1

      const latitude = parseDmsRational(exifData.GPSLatitude) * latMultiplier
      const longitude = parseDmsRational(exifData.GPSLongitude) * lngMultiplier

      if (!isNaN(latitude) && !isNaN(longitude)) {
        return { latitude, longitude }
      }
    }

    return null
  } catch (err) {
    console.error('GPS extraction error:', err)
    return null
  }
}

function degToDmsRational(decimal: number): [number, number][] {
  const absolute = Math.abs(decimal)
  const degrees = Math.floor(absolute)
  const minutesFloat = (absolute - degrees) * 60
  const minutes = Math.floor(minutesFloat)
  const seconds = Math.round((minutesFloat - minutes) * 60 * 100) / 100
  return [[degrees, 1], [minutes, 1], [Math.round(seconds * 100), 100]]
}

async function injectGpsIntoJpeg(jpegBlob: Blob, latitude: number, longitude: number): Promise<Blob> {
  const piexif = await import('piexifjs')

  const jpegDataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(jpegBlob)
  })

  const latRef = latitude < 0 ? 'S' : 'N'
  const lngRef = longitude < 0 ? 'W' : 'E'

  const gps: Record<number, unknown> = {}
  gps[piexif.GPSIFD.GPSVersionID] = [2, 2, 0, 0]
  gps[piexif.GPSIFD.GPSLatitudeRef] = latRef
  gps[piexif.GPSIFD.GPSLatitude] = degToDmsRational(Math.abs(latitude))
  gps[piexif.GPSIFD.GPSLongitudeRef] = lngRef
  gps[piexif.GPSIFD.GPSLongitude] = degToDmsRational(Math.abs(longitude))

  const exifObj = {
    '0th': {},
    'Exif': {},
    'GPS': gps,
    'Interop': {},
    '1st': {},
    'thumbnail': undefined
  }

  const exifBytes = piexif.dump(exifObj)
  const newJpegDataUrl = piexif.insert(exifBytes, jpegDataUrl)

  const newBlob = await new Promise<Blob>((resolve, reject) => {
    fetch(newJpegDataUrl)
      .then(res => res.blob())
      .then(blob => resolve(blob))
      .catch(reject)
  })

  return newBlob
}

async function convertHeicToJpeg(file: File, gpsData: { latitude: number; longitude: number }): Promise<File> {
  const heic2any = (await import('heic2any')).default
  const arrayBuffer = await file.arrayBuffer()
  const blob = new Blob([arrayBuffer], { type: file.type })
  const convertedBlob = await heic2any({ blob, toType: 'image/jpeg', quality: 0.9 })
  const convertedArray = Array.isArray(convertedBlob) ? convertedBlob[0] : convertedBlob

  const finalBlob = await injectGpsIntoJpeg(convertedArray, gpsData.latitude, gpsData.longitude)

  return new File([finalBlob], file.name.replace(/\.heic$/i, '.jpg').replace(/\.heif$/i, '.jpg'), {
    type: 'image/jpeg',
    lastModified: Date.now()
  })
}

async function blobToDataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

async function extractCaptureDate(file: File): Promise<string | null> {
  try {
    const exifr = (await import('exifr')).default
    const buffer = await file.arrayBuffer()
    const exifData = await exifr.parse(buffer)
    const dateStr = exifData?.DateTimeOriginal || exifData?.DateTimeDigitized
    if (dateStr) {
      const date = new Date(dateStr)
      if (!isNaN(date.getTime())) {
        return date.toISOString()
      }
    }
    return null
  } catch (err) {
    console.error('DateTime extraction error:', err)
    return null
  }
}

function isHeicFile(file: File): boolean {
  const name = file.name.toLowerCase()
  const type = file.type.toLowerCase()
  return (
    name.endsWith('.heic') ||
    name.endsWith('.heif') ||
    type === 'image/heic' ||
    type === 'image/heif' ||
    type === 'image/x-heic'
  )
}

export default function UploadForm() {
  const [file, setFile] = useState<File | null>(null)
  const [compressedFile, setCompressedFile] = useState<File | null>(null)
  const [imageCaptureDate, setImageCaptureDate] = useState<string | null>(null)
  const [gpsData, setGpsData] = useState<{ latitude: number; longitude: number } | null>(null)
  const [uploading, setUploading] = useState(false)
  const [compressing, setCompressing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [currentStep, setCurrentStep] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [showLocationConfirm, setShowLocationConfirm] = useState(false)
  const [uploadedImageUrl, setUploadedImageUrl] = useState<string | null>(null)
  const [confirmedLat, setConfirmedLat] = useState<number | null>(null)
  const [confirmedLng, setConfirmedLng] = useState<number | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleLocationConfirm = (latitude: number, longitude: number) => {
    setConfirmedLat(latitude)
    setConfirmedLng(longitude)
  }

  const handleLocationCancel = () => {
    setShowLocationConfirm(false)
    setUploadedImageUrl(null)
    setConfirmedLat(null)
    setConfirmedLng(null)
  }

  useEffect(() => {
    if (confirmedLat !== null && confirmedLng !== null && uploadedImageUrl) {
      sessionStorage.setItem('pendingUpload', JSON.stringify({
        imageUrl: uploadedImageUrl,
        latitude: confirmedLat,
        longitude: confirmedLng,
        captureDate: imageCaptureDate
      }))
      window.location.href = '/submit'
    }
  }, [confirmedLat, confirmedLng, uploadedImageUrl, imageCaptureDate])

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

  const processFile = async (selectedFile: File) => {
    // Reset state
    setError(null)
    setFile(null)
    setCompressedFile(null)
    setProgress(0)

    // Validate file type
    if (!selectedFile.type.startsWith('image/') && !isHeicFile(selectedFile)) {
      setError('Please select an image file (JPEG, PNG, WebP, HEIC, etc.)')
      return
    }

    // Check initial file size
    const maxOriginalSize = 20 * 1024 * 1024 // 20MB
    if (selectedFile.size > maxOriginalSize) {
      setError(`File is too large (${(selectedFile.size / 1024 / 1024).toFixed(1)}MB). Maximum allowed: 20MB.`)
      return
    }

    // Extract capture date and GPS from original file
    const captureDate = await extractCaptureDate(selectedFile)
    setImageCaptureDate(captureDate)

    let extractedGps: { latitude: number; longitude: number } | null = null

    // Convert HEIC to JPEG if needed
    let fileToProcess = selectedFile
    if (isHeicFile(selectedFile)) {
      try {
        setCurrentStep('Extracting GPS from HEIC...')
        setProgress(5)
        extractedGps = await extractGpsFromFile(selectedFile)

        if (!extractedGps) {
          setError('No GPS data found in image. Please ensure GPS is enabled when taking the photo.')
          return
        }

        setGpsData(extractedGps)
        setCurrentStep('Converting HEIC...')
        setProgress(10)
        fileToProcess = await convertHeicToJpeg(selectedFile, extractedGps)
      } catch (err) {
        console.error('HEIC conversion error:', err)
        setError('Failed to convert HEIC image. Please try converting it to JPEG on your device first.')
        return
      }
    } else {
      // For non-HEIC files, extract GPS from the file directly
      try {
        setCurrentStep('Extracting GPS...')
        setProgress(5)
        extractedGps = await extractGpsFromFile(selectedFile)
        if (extractedGps) {
          setGpsData(extractedGps)
        }
      } catch (err) {
        console.error('GPS extraction error:', err)
      }
    }

    setFile(fileToProcess)

    trackUploadStarted('new')

    await compressImage(fileToProcess)
  }

  const compressImage = async (originalFile: File) => {
    try {
      setCompressing(true)
      setCurrentStep('Compressing image...')
      setProgress(10)

      // Native Canvas-based compression (no external libraries)
      const compressed = await compressImageNative(originalFile, 0.3, 1200)

      setProgress(90)
      setCompressedFile(compressed)
      setProgress(100)
      setCurrentStep('Image ready for upload!')
      setTimeout(() => setProgress(0), 1000) // Clear progress after success

    } catch (err) {
      console.error('Compression error:', err)
      setError('Failed to compress image. Please try a different image or contact support.')
      setFile(null)
    } finally {
      setCompressing(false)
    }
  }

  const handleUpload = async () => {
    const fileToUpload = compressedFile || file
    if (!fileToUpload) return

    setUploading(true)
    setError(null)
    setProgress(0)

    try {
      setCurrentStep('Checking authentication...')
      setProgress(5)

      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        throw new Error('Please log in to upload routes')
      }

      setCurrentStep('Using pre-extracted GPS...')
      setProgress(20)

      const latitude = gpsData?.latitude ?? null
      const longitude = gpsData?.longitude ?? null

      setProgress(40)

      setCurrentStep('Uploading image...')
      setProgress(60)

      // Upload to Supabase Storage
      const fileName = `${user.id}/${Date.now()}-${fileToUpload.name}`
      const { data, error: uploadError } = await supabase.storage
        .from('route-uploads')
        .upload(fileName, fileToUpload)

      if (uploadError) {
        if (uploadError.message?.includes('size')) {
          throw new Error('Image is still too large after compression. Please try a smaller image.')
        }
        throw new Error(`Upload failed: ${uploadError.message}`)
      }

      setProgress(80)

      const { data: { publicUrl } } = supabase.storage
        .from('route-uploads')
        .getPublicUrl(data.path)

      setProgress(90)

      // Determine if GPS data was found
      const hasGps = latitude !== null && longitude !== null

      setCurrentStep('Preparing route editor...')
      setProgress(100)

      setUploadedImageUrl(publicUrl)
      setShowLocationConfirm(true)
      setUploading(false)

      trackUploadCompleted(data.path, 0)

    } catch (err) {
      console.error('Upload error:', err)

      // Provide user-friendly error messages
      let errorMessage = 'Upload failed. Please try again.'

      if (err instanceof Error) {
        errorMessage = err.message
      } else if (typeof err === 'string') {
        errorMessage = err
      }

      setError(errorMessage)
      setProgress(0)
      setCurrentStep('')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="max-w-md mx-auto space-y-4">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif,.heic,.heif"
        onChange={handleFileChange}
        disabled={compressing || uploading}
        className="hidden"
      />

      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => fileInputRef.current?.click()}
        className={`
          relative border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-all duration-200
          ${isDragging
            ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
            : 'border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500'
          }
          ${compressing || uploading ? 'opacity-50 cursor-not-allowed' : ''}
        `}
      >
        <svg className={`w-12 h-12 mx-auto ${isDragging ? 'text-blue-500' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mt-2">
          {isDragging ? 'Drop image here' : 'Click or drag image to upload'}
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          GPS-enabled photo (JPEG, PNG, HEIC), max 10MB
        </p>
      </div>

      {file && (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <img src={URL.createObjectURL(file)} alt="Preview" className="w-12 h-12 rounded object-cover" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{file.name}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {(file.size / 1024 / 1024).toFixed(2)}MB
                {compressedFile && ` → ${(compressedFile.size / 1024).toFixed(0)}KB`}
              </p>
            </div>
            <button onClick={() => { setFile(null); setCompressedFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; }} className="text-gray-400 hover:text-gray-600">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {(compressing || uploading || progress > 0) && (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 p-4 rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              {compressing ? 'Compressing' : uploading ? 'Uploading' : 'Processing'}
            </span>
            <span className="text-sm text-gray-500 dark:text-gray-400">{Math.round(progress)}%</span>
          </div>
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
            <div className="bg-gray-600 dark:bg-gray-500 h-2 rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
          </div>
          {currentStep && <p className="text-xs text-gray-600 dark:text-gray-400 mt-2">{currentStep}</p>}
        </div>
      )}

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-3 rounded-lg">
          <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
        </div>
      )}

      <button
        onClick={handleUpload}
        disabled={!file || compressing || uploading}
        className="w-full bg-gray-800 dark:bg-gray-700 text-white dark:text-gray-100 py-3 px-4 rounded-lg font-medium hover:bg-gray-700 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {compressing ? 'Compressing...' : uploading ? 'Uploading...' : 'Upload & Continue'}
      </button>

      {showLocationConfirm && uploadedImageUrl && (
        <LocationConfirmModal
          latitude={gpsData?.latitude ?? null}
          longitude={gpsData?.longitude ?? null}
          imageUrl={uploadedImageUrl}
          onConfirm={handleLocationConfirm}
          onCancel={handleLocationCancel}
        />
      )}
    </div>
  )
}