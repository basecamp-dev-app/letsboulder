'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import NextImage from 'next/image'
import type { NewImageSelection, GpsData } from '@/features/submissions/lib/submission-types'
import { isHeicFile, isSupportedImageFile } from '@/lib/image-utils'
import { extractGpsFromFile } from '@/lib/image-gps'
import {
  buildSubmittedImageSelection,
  compressSubmissionImage,
  detectSubmissionImageGps,
  getImageDimensions,
  uploadSubmissionImageSession,
} from '@/app/submit/components/image-uploader-flow'

interface ImageUploaderProps {
  onComplete: (result: NewImageSelection) => void
  onError: (error: string) => void
  onUploading: (uploading: boolean, progress: number, step: string) => void
}

export default function ImageUploader({ onComplete, onError, onUploading }: ImageUploaderProps) {
  const [file, setFile] = useState<File | null>(null)
  const [compressedFile, setCompressedFile] = useState<File | null>(null)
  const [detectedGpsData, setDetectedGpsData] = useState<GpsData | null>(null)
  const [gpsDetectionComplete, setGpsDetectionComplete] = useState(false)
  const [isIosDevice, setIsIosDevice] = useState(false)
  const [isAndroidDevice, setIsAndroidDevice] = useState(false)
  const [compressing, setCompressing] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const detectedGpsRef = useRef<GpsData | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  const setPreviewObjectUrl = useCallback((source: Blob | File) => {
    const nextUrl = URL.createObjectURL(source)
    setPreviewUrl((currentUrl) => {
      if (currentUrl) {
        URL.revokeObjectURL(currentUrl)
      }
      return nextUrl
    })
  }, [])

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
    const isAndroid = /Android/i.test(userAgent)
    setIsIosDevice(isIos)
    setIsAndroidDevice(isAndroid)
  }, [])

  useEffect(() => {
    return () => {
      setPreviewUrl((currentUrl) => {
        if (currentUrl) {
          URL.revokeObjectURL(currentUrl)
        }
        return null
      })
    }
  }, [])

  const compressImage = useCallback(async (originalFile: File, previewBlob: Blob | null = null) => {
    try {
      setCompressing(true)
      onUploading(true, 20, 'Compressing image...')

      const compressed = await compressSubmissionImage(originalFile, previewBlob)

      setCompressedFile(compressed)
      onUploading(false, 0, '')
    } catch {
      setCompressedFile(null)
      onError('Could not compress image. We will upload the original file instead.')
      onUploading(false, 0, '')
    } finally {
      setCompressing(false)
    }
  }, [onError, onUploading])

  const processFile = useCallback(async (selectedFile: File) => {
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

      if (isHeicFile(selectedFile)) {
        onUploading(true, 15, 'Loading HEIC preview...')
      }

      const { gpsData: gpsFromFile, previewBlob } = await detectSubmissionImageGps(selectedFile)

      if (isHeicFile(selectedFile)) {
        if (previewBlob) {
          setPreviewObjectUrl(previewBlob)
        }
        onUploading(true, 20, 'Compressing HEIC...')
      } else {
        setPreviewObjectUrl(selectedFile)
        onUploading(true, 20, 'Compressing image...')
      }

      updateDetectedGps(gpsFromFile)
      setGpsDetectionComplete(true)
      setFile(selectedFile)
      await compressImage(selectedFile, previewBlob)
    } catch (error) {
      const message = error instanceof Error ? error.message : ''
      onError(message.includes('HEIC') ? 'Failed to process HEIC image. Please convert to JPEG first.' : 'Failed to process image. Please try a different file.')
      onUploading(false, 0, '')
    }
  }, [compressImage, onError, onUploading, setPreviewObjectUrl, updateDetectedGps])

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (!selectedFile) return

    e.target.value = ''
    await processFile(selectedFile)
  }, [processFile])

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)

    const droppedFile = e.dataTransfer.files[0]
    if (!droppedFile) return

    await processFile(droppedFile)
  }, [processFile])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const handleConfirm = useCallback(async () => {
    if (!compressedFile) {
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
      onUploading(true, 20, 'Uploading image...')

      const uploadSession = await uploadSubmissionImageSession(compressedFile, finalGps)
      const tempPreviewUrl = previewUrl || URL.createObjectURL(compressedFile)

      onUploading(true, 70, 'Getting image info...')
      const dimensions = await getImageDimensions(tempPreviewUrl)

      const result = buildSubmittedImageSelection(uploadSession, tempPreviewUrl, finalGps, dimensions)
      onUploading(false, 100, '')
      onComplete(result)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to upload image'
      onError(message.includes('size') ? 'Image is too large. Please try a smaller image.' : `Upload failed: ${message}`)
      onUploading(false, 0, '')
    }
  }, [compressedFile, file, onComplete, onError, onUploading, previewUrl, updateDetectedGps])

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
                setPreviewUrl((currentUrl) => {
                  if (currentUrl) {
                    URL.revokeObjectURL(currentUrl)
                  }
                  return null
                })
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
                No GPS metadata found in this file. Gallery/Photos pickers can strip location metadata. You can place the pin manually in the next step.
              </p>
              {isAndroidDevice && (
                <p className="text-sm text-amber-700 dark:text-amber-300 mt-2">
                  Android tip: re-select using Files/My Files and choose the original image file.
                </p>
              )}
              {isIosDevice && (
                <p className="text-sm text-amber-700 dark:text-amber-300 mt-2">
                  iPhone tip: re-select from the Files app (Browse) and choose the original image file.
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
            {isDragging ? 'Drop original image file here' : 'Choose original image file'}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            JPEG, PNG, HEIC, WebP, max 20MB
          </p>
          {(isAndroidDevice || isIosDevice) && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Use Files/My Files (not Gallery/Photos picker) to preserve GPS metadata
            </p>
          )}
        </div>
      )}
    </div>
  )
}
