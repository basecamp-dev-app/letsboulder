'use client'

'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import type { NewImageSelection, GpsData } from '@/lib/submission-types'

interface ImageUploaderProps {
  onComplete: (result: NewImageSelection) => void
  onError: (error: string) => void
  onUploading: (uploading: boolean, progress: number, step: string) => void
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
      } catch (err) {
        console.error('HEIC conversion error:', err)
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
      
      img.onerror = (e) => {
        console.error('Image load error:', e)
        console.error('File type:', file.type)
        console.error('File size:', file.size)
        reject(new Error(`Failed to load image for compression. File type: ${file.type}`))
      }
      img.src = imgSrc
    }
    
    reader.onerror = (e) => {
      console.error('FileReader error:', e)
      reject(new Error('Failed to read file'))
    }

    if (sourceData) {
      reader.onload({ target: { result: sourceData } } as ProgressEvent<FileReader>)
    } else {
      reader.readAsDataURL(file)
    }
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

async function blobToDataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

async function extractGpsFromFile(file: File): Promise<GpsData | null> {
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

async function heicToJpegBlob(file: File): Promise<Blob> {
  const heic2any = (await import('heic2any')).default
  const blob = file instanceof Blob ? file : new Blob([file], { type: 'image/heic' })
  const jpegBlob = await heic2any({ blob, toType: 'image/jpeg', quality: 0.9 })
  return Array.isArray(jpegBlob) ? jpegBlob[0] : jpegBlob
}

export default function ImageUploader({ onComplete, onError, onUploading }: ImageUploaderProps) {
  const [file, setFile] = useState<File | null>(null)
  const [compressedFile, setCompressedFile] = useState<File | null>(null)
  const [imageCaptureDate, setImageCaptureDate] = useState<string | null>(null)
  const [gpsData, setGpsData] = useState<GpsData | null>(null)
  const [compressing, setCompressing] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [manualGps, setManualGps] = useState<{ lat: string; lng: string }>({ lat: '', lng: '' })
  const [showManualGps, setShowManualGps] = useState(false)

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
    onError('')
    setFile(null)
    setCompressedFile(null)
    setShowManualGps(false)

    if (!selectedFile.type.startsWith('image/') && !isHeicFile(selectedFile)) {
      onError('Please select an image file (JPEG, PNG, WebP, HEIC, etc.)')
      return
    }

    const maxOriginalSize = 20 * 1024 * 1024
    if (selectedFile.size > maxOriginalSize) {
      onError(`File is too large (${(selectedFile.size / 1024 / 1024).toFixed(1)}MB). Maximum allowed: 20MB.`)
      return
    }

    console.log('Processing file:', selectedFile.name, selectedFile.size, selectedFile.type)

    try {
      let previewBlob: Blob | null = null

      if (isHeicFile(selectedFile)) {
        try {
          onUploading(true, 5, 'Loading HEIC preview...')
          previewBlob = await heicToJpegBlob(selectedFile)
          setPreviewUrl(URL.createObjectURL(previewBlob))

          onUploading(true, 10, 'Extracting GPS from HEIC...')
          const extractedGps = await extractGpsFromFile(selectedFile)

          if (!extractedGps) {
            onUploading(false, 0, '')
            setShowManualGps(true)
            setFile(selectedFile)
            return
          }

          setGpsData(extractedGps)
          onUploading(true, 15, 'Converting HEIC...')
        } catch (err) {
          console.error('HEIC conversion error:', err)
          onError('Failed to process HEIC image. Please convert to JPEG first.')
          onUploading(false, 0, '')
          return
        }
      } else {
        setPreviewUrl(URL.createObjectURL(selectedFile))

        onUploading(true, 5, 'Extracting GPS...')
        const extractedGps = await extractGpsFromFile(selectedFile)
        if (extractedGps) {
          setGpsData(extractedGps)
        } else {
          setShowManualGps(true)
        }
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
      setShowManualGps(gpsData === null)
      onUploading(false, 0, '')

    } catch (err) {
      console.error('Compression error:', err)
      onError('Failed to compress image. Please try a different image.')
      setFile(null)
      onUploading(false, 0, '')
    } finally {
      setCompressing(false)
    }
  }

  const handleConfirm = async () => {
    const fileToUpload = compressedFile || file
    if (!fileToUpload) {
      onError('No image selected. Please upload an image first.')
      return
    }

    console.log('Confirming with file:', fileToUpload.name)
    console.log('File size:', fileToUpload.size)
    console.log('GPS data:', gpsData)
    console.log('Manual GPS:', manualGps)

    if (!gpsData && (!manualGps.lat || !manualGps.lng)) {
      onError('GPS coordinates are required. Please enter them manually.')
      return
    }

    const finalGps = gpsData || { 
      latitude: parseFloat(manualGps.lat), 
      longitude: parseFloat(manualGps.lng) 
    }

    if (isNaN(finalGps.latitude) || isNaN(finalGps.longitude)) {
      onError('Invalid GPS coordinates')
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
        .from('route-uploads')
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

      onUploading(true, 80, 'Completing...')

      const { data: { publicUrl } } = supabase.storage
        .from('route-uploads')
        .getPublicUrl(data.path)

      const img = new Image()
      img.src = publicUrl
      await new Promise<void>((resolve) => {
        img.onload = () => resolve()
        img.onerror = () => resolve()
      })

      const result: NewImageSelection = {
        mode: 'new',
        file: fileToUpload,
        gpsData: finalGps,
        captureDate: imageCaptureDate,
        width: img.naturalWidth || 0,
        height: img.naturalHeight || 0,
        uploadedUrl: publicUrl
      }

      onUploading(false, 100, '')
      onComplete(result)

    } catch (err) {
      console.error('Upload error:', err)
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
          <div className="relative rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
            <img src={previewUrl} alt="Preview" className="w-full h-48 object-contain bg-gray-100 dark:bg-gray-800" />
            <button
              onClick={() => {
                setFile(null)
                setCompressedFile(null)
                setPreviewUrl(null)
                setGpsData(null)
                setShowManualGps(false)
                if (fileInputRef.current) fileInputRef.current.value = ''
              }}
              className="absolute top-2 right-2 p-1 bg-black/50 text-white rounded-full hover:bg-black/70"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {gpsData ? (
            <div className="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded text-sm text-green-700 dark:text-green-400">
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <span>GPS: {gpsData.latitude.toFixed(6)}, {gpsData.longitude.toFixed(6)}</span>
              </div>
            </div>
          ) : null}

          {showManualGps && !gpsData && (
            <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded">
              <p className="text-sm text-yellow-700 dark:text-yellow-400 mb-2">
                No GPS data found. Please enter coordinates manually (required):
              </p>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="number"
                  step="0.000001"
                  placeholder="Latitude"
                  value={manualGps.lat}
                  onChange={(e) => setManualGps(prev => ({ ...prev, lat: e.target.value }))}
                  className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                />
                <input
                  type="number"
                  step="0.000001"
                  placeholder="Longitude"
                  value={manualGps.lng}
                  onChange={(e) => setManualGps(prev => ({ ...prev, lng: e.target.value }))}
                  className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                />
              </div>
            </div>
          )}

          <button
            onClick={handleConfirm}
            disabled={compressing || (!gpsData && (!manualGps.lat || !manualGps.lng))}
            className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {compressing ? 'Compressing...' : 'Confirm & Continue'}
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
            GPS-enabled photo required (JPEG, PNG, HEIC), max 20MB
          </p>
        </div>
      )}
    </div>
  )
}
