'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import imageCompression from 'browser-image-compression'

export default function UploadForm() {
  const [file, setFile] = useState<File | null>(null)
  const [compressedFile, setCompressedFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [compressing, setCompressing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [currentStep, setCurrentStep] = useState<string>('')
  const [error, setError] = useState<string | null>(null)

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (!selectedFile) return

    // Reset state
    setError(null)
    setFile(null)
    setCompressedFile(null)
    setProgress(0)

    // Validate file type
    if (!selectedFile.type.startsWith('image/')) {
      setError('Please select an image file (JPEG, PNG, WebP, etc.)')
      return
    }

    // Check initial file size
    const maxOriginalSize = 10 * 1024 * 1024 // 10MB
    if (selectedFile.size > maxOriginalSize) {
      setError(`File is too large (${(selectedFile.size / 1024 / 1024).toFixed(1)}MB). Maximum allowed: 10MB.`)
      return
    }

    setFile(selectedFile)

    // Start compression
    await compressImage(selectedFile)
  }

  const compressImage = async (originalFile: File) => {
    try {
      setCompressing(true)
      setCurrentStep('Compressing image...')
      setProgress(10)

      const options = {
        maxSizeMB: 0.3, // Target 300KB max (like Signal compression)
        maxWidthOrHeight: 1600, // High quality for laptop viewing
        useWebWorker: true,
        preserveExif: true, // Keep GPS data critical for climbing routes!
        initialQuality: 0.8, // 80% quality for good visual balance
        onProgress: (progress: number) => {
          setProgress(10 + (progress * 0.8)) // 10-90% for compression
        }
      }

      setCurrentStep('Optimizing image for fast upload (high quality, ~300KB)...')
      const compressed = await imageCompression(originalFile, options)

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

      setCurrentStep('Extracting GPS location data...')
      setProgress(20)

      // Extract GPS with better error handling and timeout
      const formData = new FormData()
      formData.append('file', fileToUpload)

      // Add timeout to prevent hanging on large files
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 30000) // 30 second timeout

      let gpsResponse
      try {
        gpsResponse = await fetch('/api/extract-gps', {
          method: 'POST',
          body: formData,
          signal: controller.signal
        })
      } catch (fetchError: any) {
        if (fetchError.name === 'AbortError') {
          throw new Error('GPS extraction timed out. The image may be too large. Please try a smaller image.')
        }
        throw new Error('Network error while processing image. Please check your connection.')
      } finally {
        clearTimeout(timeoutId)
      }

      // Check if response is JSON before parsing
      const contentType = gpsResponse.headers.get('content-type')
      if (!contentType?.includes('application/json')) {
        throw new Error('Server returned an unexpected response. Please try again.')
      }

      const gpsData = await gpsResponse.json()

      if (!gpsResponse.ok) {
        if (gpsData.error?.includes('GPS') || gpsData.error?.includes('location')) {
          throw new Error('Could not find GPS location in image. Please ensure GPS is enabled when taking the photo.')
        }
        throw new Error(gpsData.error || 'Failed to process image location data')
      }

      const { latitude, longitude } = gpsData
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

      // Small delay to show completion
      setTimeout(() => {
        // Redirect to draw page with session data
        window.location.href = `/draw?imageUrl=${encodeURIComponent(publicUrl)}&lat=${latitude}&lng=${longitude}&hasGps=${hasGps}&sessionId=${Date.now()}`
      }, 500)

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
      {/* File Input */}
      <div>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          onChange={handleFileChange}
          disabled={compressing || uploading}
          className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 disabled:opacity-50"
        />
        <p className="text-xs text-gray-500 mt-1">
          Choose a GPS-enabled photo (max 10MB). Images are optimized to ~300KB for fast uploads while maintaining laptop viewing quality.
        </p>
      </div>

      {/* File Info */}
      {file && (
        <div className="bg-gray-50 p-3 rounded-lg">
          <p className="text-sm font-medium text-gray-700">{file.name}</p>
          <p className="text-xs text-gray-500">
            Original: {(file.size / 1024 / 1024).toFixed(1)}MB
            {compressedFile && ` → Optimized: ${(compressedFile.size / 1024).toFixed(0)}KB (${Math.round((compressedFile.size / file.size) * 100)}% of original)`}
          </p>
        </div>
      )}

      {/* Progress Indicator */}
      {(compressing || uploading || progress > 0) && (
        <div className="bg-white border border-gray-200 p-4 rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700">
              {compressing ? 'Compressing Image' : uploading ? 'Uploading' : 'Processing'}
            </span>
            <span className="text-sm text-gray-500">{Math.round(progress)}%</span>
          </div>

          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-blue-500 h-2 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>

          {currentStep && (
            <p className="text-xs text-gray-600 mt-2">{currentStep}</p>
          )}
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 border border-red-200 p-3 rounded-lg">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Upload Button */}
      <button
        onClick={handleUpload}
        disabled={!file || compressing || uploading}
        className="w-full bg-blue-500 text-white py-3 px-4 rounded-lg font-medium hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {compressing ? 'Compressing...' : uploading ? 'Uploading...' : 'Upload & Continue'}
      </button>

      {/* Help Text */}
      <div className="text-xs text-gray-500 space-y-1">
        <p>• Ensure GPS is enabled when taking photos for automatic location detection</p>
        <p>• Images are optimized to ~300KB (like Signal) for fast uploads while maintaining laptop quality</p>
        <p>• Supported formats: JPEG, PNG, WebP, GIF</p>
      </div>
    </div>
  )
}