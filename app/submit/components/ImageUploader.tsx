'use client'

import { useState, useRef, useCallback } from 'react'
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

async function extractGpsFromFile(file: File): Promise<GpsData | null> {
  try {
    const exifr = (await import('exifr')).default
    const buffer = await file.arrayBuffer()
    const exifData = await exifr.parse(buffer, { tiff: true, exif: true, gps: true })

    if (exifData?.latitude && exifData?.longitude) {
      return { latitude: exifData.latitude, longitude: exifData.longitude }
    }

    if (exifData?.GPSLatitude && exifData?.GPSLongitude) {
      const latRef = exifData.GPSLatitudeRef || 'N'
      const lonRef = exifData.GPSLongitudeRef || 'W'

      const lat = convertDmsToDecimal(exifData.GPSLatitude, latRef)
      const lon = convertDmsToDecimal(exifData.GPSLongitude, lonRef)

      if (lat !== null && lon !== null) {
        return { latitude: lat, longitude: lon }
      }
    }

    return null
  } catch (err) {
    console.error('GPS extraction error:', err)
    return null
  }
}

function convertDmsToDecimal(dms: number[], ref: string): number | null {
  if (!dms || dms.length < 3) return null

  const degrees = dms[0]
  const minutes = dms[1]
  const seconds = dms[2]

  let decimal = degrees + minutes / 60 + seconds / 3600

  if (ref === 'S' || ref === 'W') {
    decimal = -decimal
  }

  return decimal
}

export default function ImageUploader({ onComplete, onError, onUploading }: ImageUploaderProps) {
  const [file, setFile] = useState<File | null>(null)
  const [compressedFile, setCompressedFile] = useState<File | null>(null)
  const [gpsData, setGpsData] = useState<GpsData | null>(null)
  const [compressing, setCompressing] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [attestationChecked, setAttestationChecked] = useState(false)

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
    setGpsData(null)
    setAttestationChecked(false)

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

          onUploading(true, 15, 'Extracting GPS...')
          const gps = await extractGpsFromFile(selectedFile)
          console.log('HEIC GPS extraction result:', gps)
          setGpsData(gps)

          onUploading(true, 20, 'Compressing HEIC...')
        } catch (err) {
          console.error('HEIC conversion error:', err)
          onError('Failed to process HEIC image. Please convert to JPEG first.')
          onUploading(false, 0, '')
          return
        }
      } else {
        setPreviewUrl(URL.createObjectURL(selectedFile))

        onUploading(true, 10, 'Extracting GPS...')
        const gps = await extractGpsFromFile(selectedFile)
        console.log('JPEG GPS extraction result:', gps)
        setGpsData(gps)

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

      onUploading(true, 60, 'Getting image info...')

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
        gpsData: gpsData,
        captureDate: null,
        width: img.naturalWidth || 0,
        height: img.naturalHeight || 0,
        uploadedUrl: publicUrl
      }

      console.log('Final result with GPS:', result.gpsData)
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
                setGpsData(null)
                setPreviewUrl(null)
                setAttestationChecked(false)
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
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={attestationChecked}
                onChange={(e) => {
                  setAttestationChecked(e.target.checked)
                  if (e.target.checked) {
                    handleConfirm()
                  }
                }}
                className="mt-1"
              />
              <span className="text-sm text-blue-700 dark:text-blue-300">
                I confirm I have rights to this image and it shows a climbing route
              </span>
            </label>
          </div>

          <button
            onClick={handleConfirm}
            disabled={compressing || !attestationChecked}
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
            JPEG, PNG, HEIC, WebP, max 20MB
          </p>
        </div>
      )}
    </div>
  )
}
