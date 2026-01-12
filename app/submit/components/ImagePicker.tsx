'use client'

import { useState, useCallback } from 'react'
import type { ImageSelection, NewImageSelection, GpsData } from '@/lib/submission-types'
import ImageUploader from './ImageUploader'

interface ImagePickerProps {
  onSelect: (selection: ImageSelection, gpsData: GpsData | null) => void
  showBackButton?: boolean
}

export default function ImagePicker({ onSelect, showBackButton = false }: ImagePickerProps) {
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [currentStep, setCurrentStep] = useState('')
  const [error, setError] = useState<string | null>(null)

  const handleUploadComplete = (result: NewImageSelection) => {
    setUploading(false)
    setProgress(0)
    setCurrentStep('')
    onSelect(result, result.gpsData || null)
  }

  const handleUploadError = (err: string) => {
    setError(err)
    setUploading(false)
  }

  const handleUploadState = (uploadingState: boolean, progressValue: number, step: string) => {
    setUploading(uploadingState)
    setProgress(progressValue)
    setCurrentStep(step)
  }

  return (
    <div className="image-picker">
      {error && (
        <div className="mb-3 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">
          {error}
        </div>
      )}

      <ImageUploader
        onComplete={handleUploadComplete}
        onError={handleUploadError}
        onUploading={handleUploadState}
      />

      {uploading && (
        <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
          <div className="flex items-center gap-2 mb-2">
            <div className="animate-spin h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full" />
            <span className="text-sm text-gray-600 dark:text-gray-400">{currentStep}</span>
          </div>
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
            <div
              className="bg-blue-500 h-2 rounded-full transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}
    </div>
  )
}
