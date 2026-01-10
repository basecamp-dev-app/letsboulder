'use client'

import { useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import type { Image, ImageSelection, ExistingImageSelection, NewImageSelection, GpsData } from '@/lib/submission-types'
import ImageUploader from './ImageUploader'

interface ImagePickerProps {
  cragId: string
  cragName: string
  onSelect: (selection: ImageSelection) => void
}

export default function ImagePicker({ cragId, cragName, onSelect }: ImagePickerProps) {
  const [activeTab, setActiveTab] = useState<'existing' | 'new'>('existing')
  const [existingImages, setExistingImages] = useState<Image[]>([])
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [currentStep, setCurrentStep] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [uploadedImage, setUploadedImage] = useState<NewImageSelection | null>(null)

  const loadExistingImages = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(`/api/images/search?crag_id=${cragId}`)
      if (response.ok) {
        const data = await response.json()
        setExistingImages(data)
      } else {
        setError('Failed to load images')
      }
    } catch (err) {
      console.error('Error loading images:', err)
      setError('Failed to load images')
    } finally {
      setLoading(false)
    }
  }, [cragId])

  const handleTabChange = (tab: 'existing' | 'new') => {
    setActiveTab(tab)
    setError(null)
    if (tab === 'existing') {
      loadExistingImages()
    }
  }

  const handleSelectExisting = async (image: Image) => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(`/api/images/search?crag_id=${cragId}&limit=1`)
      if (response.ok) {
        const selection: ExistingImageSelection = {
          mode: 'existing',
          imageId: image.id,
          imageUrl: image.url
        }
        onSelect(selection)
      } else {
        setError('Failed to load image details')
      }
    } catch (err) {
      console.error('Error selecting image:', err)
      setError('Failed to select image')
    } finally {
      setLoading(false)
    }
  }

  const handleUploadComplete = (result: NewImageSelection) => {
    setUploading(false)
    setProgress(0)
    setCurrentStep('')
    setUploadedImage(result)
    onSelect(result)
  }

  const handleUploadError = (err: string) => {
    setError(err)
  }

  const handleUploadState = (uploadingState: boolean, progressValue: number, step: string) => {
    setUploading(uploadingState)
    setProgress(progressValue)
    setCurrentStep(step)
  }

  return (
    <div className="image-picker">
      <div className="text-sm text-gray-600 dark:text-gray-400 mb-3">
        Images at <span className="font-medium text-gray-900 dark:text-gray-100">{cragName}</span>
      </div>

      <div className="flex border-b border-gray-200 dark:border-gray-700 mb-4">
        <button
          onClick={() => handleTabChange('existing')}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            activeTab === 'existing'
              ? 'border-blue-500 text-blue-600 dark:text-blue-400'
              : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400'
          }`}
        >
          Existing Images
        </button>
        <button
          onClick={() => handleTabChange('new')}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            activeTab === 'new'
              ? 'border-blue-500 text-blue-600 dark:text-blue-400'
              : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400'
          }`}
        >
          Upload New
        </button>
      </div>

      {error && (
        <div className="mb-3 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">
          {error}
        </div>
      )}

      {activeTab === 'existing' && (
        <div className="existing-images">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin h-6 w-6 border-2 border-blue-500 border-t-transparent rounded-full" />
            </div>
          ) : existingImages.length === 0 ? (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              <p className="mb-2">No images for this crag yet</p>
              <p className="text-sm">Upload a new image to get started</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-64 overflow-y-auto">
              {existingImages.map((image) => (
                <button
                  key={image.id}
                  onClick={() => handleSelectExisting(image)}
                  className="relative group aspect-square overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700 hover:border-blue-500 transition-colors"
                >
                  <img
                    src={image.url}
                    alt="Climbing area"
                    className="w-full h-full object-cover"
                  />
                  {image.route_lines_count !== undefined && image.route_lines_count > 0 && (
                    <div className="absolute bottom-1 right-1 bg-black/70 text-white text-xs px-1.5 py-0.5 rounded">
                      {image.route_lines_count} route{image.route_lines_count !== 1 ? 's' : ''}
                    </div>
                  )}
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'new' && (
        <ImageUploader
          onComplete={handleUploadComplete}
          onError={handleUploadError}
          onUploading={handleUploadState}
        />
      )}

      {uploading && progress > 0 && (
        <div className="mt-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-3 rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              {currentStep || 'Processing'}
            </span>
            <span className="text-sm text-gray-500 dark:text-gray-400">{Math.round(progress)}%</span>
          </div>
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}
    </div>
  )
}
