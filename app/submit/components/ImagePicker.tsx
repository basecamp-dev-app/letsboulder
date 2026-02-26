'use client'

import { useState } from 'react'
import type { ImageSelection, NewImageSelection, GpsData } from '@/lib/submission-types'
import dynamic from 'next/dynamic'
import { Skeleton } from '@/components/ui/skeleton'

const ImageUploader = dynamic(() => import('./ImageUploader'), {
  ssr: false,
  loading: () => (
    <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-8 text-center space-y-4">
      <Skeleton className="h-12 w-12 rounded-full mx-auto" />
      <Skeleton className="h-4 w-48 mx-auto" />
      <Skeleton className="h-10 w-32 mx-auto" />
    </div>
  )
})

interface ImagePickerProps {
  onSelect: (selection: ImageSelection, gpsData: GpsData | null) => void
  showBackButton?: boolean
}

export default function ImagePicker({ onSelect }: ImagePickerProps) {
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
