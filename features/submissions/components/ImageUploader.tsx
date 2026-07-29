'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import NextImage from 'next/image'
import type { NewImageSelection } from '@/features/submissions/lib/submission-types'
import {
  buildSubmittedImageSelection,
  compressSubmissionImage,
  detectSubmissionImageGps,
  getImageDimensions,
  uploadSubmissionImageSession,
} from '@/features/submissions/lib/image-uploader-flow'
import { extractGpsFromFile } from '@/lib/image-gps'
import { isHeicFile, isSupportedImageFile } from '@/lib/image-utils'
import type { GpsData } from '@/types/domain'
import { useOpenDataConsent } from '@/features/legal/hooks/use-open-data-consent'
import { OpenDataLicenseNotice } from '@/features/legal/components/OpenDataLicenseNotice'

interface ImageUploaderProps {
  onComplete: (result: NewImageSelection) => void
  onError: (error: string) => void
  onUploading: (uploading: boolean, progress: number, step: string) => void
}

export default function ImageUploader({ onComplete, onError, onUploading }: ImageUploaderProps) {
  const { requireConsent } = useOpenDataConsent()
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

  const uploadSelectedPhoto = useCallback(async () => {
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

  const handleConfirm = useCallback(() => {
    void requireConsent(uploadSelectedPhoto)
  }, [requireConsent, uploadSelectedPhoto])

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
            type="button"
            onClick={handleConfirm}
            disabled={!compressedFile || compressing}
            className="w-full rounded-lg bg-blue-600 px-4 py-3 font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Upload Photo
          </button>
          <OpenDataLicenseNotice context="media" />
        </div>
      ) : (
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          className={`rounded-lg border-2 border-dashed p-8 text-center transition ${
            isDragging
              ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/10'
              : 'border-gray-300 dark:border-gray-600 hover:border-blue-400 dark:hover:border-blue-500'
          }`}
        >
          <div className="space-y-4">
            <div className="mx-auto h-12 w-12 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
              <svg className="h-6 w-6 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
            </div>

            <div>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={compressing}
                className="text-lg font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
              >
                Choose original image file
              </button>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">or drag and drop it here</p>
              <OpenDataLicenseNotice context="media" className="mt-2" />
            </div>

            <p className="text-xs text-gray-400 dark:text-gray-500">Supports JPEG, PNG, WebP, HEIC, and HEIF up to 20MB.</p>
          </div>
        </div>
      )}
    </div>
  )
}
