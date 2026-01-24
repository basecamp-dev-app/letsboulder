'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { dataURLToBlob } from '@/lib/image-utils'

interface AvatarUploaderProps {
  avatarUrl?: string
  initials: string
  onAvatarUpdate: (newUrl: string) => void
}

export default function AvatarUploader({ avatarUrl, initials, onAvatarUpdate }: AvatarUploaderProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (!selectedFile) return

    setError(null)

    if (!selectedFile.type.startsWith('image/')) {
      setError('Please select an image file (JPEG, PNG, WebP)')
      return
    }

    const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB

    if (selectedFile.size > MAX_FILE_SIZE) {
      setError('File is too large. Maximum size: 10MB')
      return
    }

    setFile(selectedFile)

    const reader = new FileReader()
    reader.onload = (e) => {
      setPreview(e.target?. result as string)
    }
    reader.readAsDataURL(selectedFile)
  }

  const handleUpload = async () => {
    if (!file) return

    setUploading(true)
    setError(null)
    setProgress(10)

    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        throw new Error('Please log in to update avatar')
      }

      setProgress(30)

      const compressedFile = await compressImage(file, 200, 400)

      setProgress(60)

      const fileName = `${user.id}/avatar-${Date.now()}.jpg`
      const { data, error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(fileName, compressedFile)

      if (uploadError) {
        throw new Error(`Upload failed: ${uploadError.message}`)
      }

      setProgress(80)

      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(data.path)

      if (avatarUrl) {
        const oldPath = extractStoragePath(avatarUrl)
        if (oldPath) {
          await supabase.storage.from('avatars').remove([oldPath])
        }
      }

      setProgress(90)

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: publicUrl })
        .eq('id', user.id)

      if (updateError) {
        throw new Error(`Failed to update profile: ${updateError.message}`)
      }

      setProgress(100)
      onAvatarUpdate(publicUrl)

      setTimeout(() => {
        setIsOpen(false)
        setFile(null)
        setPreview(null)
        setProgress(0)
      }, 500)

    } catch (err) {
      console.error('Avatar upload error:', err)
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  const handleRemove = async () => {
    setUploading(true)
    setError(null)
    setProgress(10)

    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        throw new Error('Please log in to remove avatar')
      }

      setProgress(50)

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: null })
        .eq('id', user.id)

      if (updateError) {
        throw new Error(`Failed to remove avatar: ${updateError.message}`)
      }

      setProgress(100)
      onAvatarUpdate('')

      setTimeout(() => {
        setIsOpen(false)
        setFile(null)
        setPreview(null)
        setProgress(0)
      }, 500)

    } catch (err) {
      console.error('Avatar remove error:', err)
      setError(err instanceof Error ? err.message : 'Failed to remove avatar')
    } finally {
      setUploading(false)
    }
  }

  const closeModal = useCallback(() => {
    if (!uploading) {
      setIsOpen(false)
      setFile(null)
      setPreview(null)
      setError(null)
      setProgress(0)
    }
  }, [uploading])

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeModal()
    }
    if (isOpen) {
      document.addEventListener('keydown', handleEscape)
      document.body.style.overflow = 'hidden'
    }
    return () => {
      document.removeEventListener('keydown', handleEscape)
      document.body.style.overflow = 'unset'
    }
  }, [isOpen, uploading, closeModal])

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="relative group cursor-pointer"
        aria-label="Edit avatar"
      >
        <div className="w-28 h-28 rounded-full overflow-hidden transition-opacity group-hover:opacity-90">
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt="Profile"
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-gray-700 dark:text-gray-200 font-bold text-2xl">
              {initials}
            </div>
          )}
        </div>
        <div className="absolute inset-0 rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <span className="text-white text-xs font-medium">Edit</span>
        </div>
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={closeModal}
          />
          <div className="relative bg-white dark:bg-gray-900 rounded-lg shadow-xl max-w-sm w-full p-6">
            <h2 className="text-xl font-bold mb-4 text-gray-900 dark:text-gray-100">
              Profile Picture
            </h2>

            {error && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-3 rounded-lg mb-4">
                <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
              </div>
            )}

            <div className="flex flex-col items-center gap-4 mb-4">
              {preview ? (
                <img
                  src={preview}
                  alt="Preview"
                  className="w-32 h-32 rounded-full object-cover"
                />
              ) : avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt="Current avatar"
                  className="w-32 h-32 rounded-full object-cover"
                />
              ) : (
                <div className="w-32 h-32 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-gray-700 dark:text-gray-200 font-bold text-3xl">
                  {initials}
                </div>
              )}
            </div>

            {!file && !uploading && (
              <div className="mb-4">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 py-2 px-4 rounded-lg font-medium hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                >
                  Choose Image
                </button>
              </div>
            )}

            {file && !uploading && (
              <div className="space-y-3 mb-4">
                <button
                  onClick={handleUpload}
                  className="w-full bg-gray-800 dark:bg-gray-700 text-white dark:text-gray-100 py-2 px-4 rounded-lg font-medium hover:bg-gray-700 dark:hover:bg-gray-600 transition-colors"
                >
                  Upload
                </button>
                <button
                  onClick={() => {
                    setFile(null)
                    setPreview(null)
                  }}
                  className="w-full bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 py-2 px-4 rounded-lg font-medium hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                >
                  Choose Different
                </button>
              </div>
            )}

            {uploading && (
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    {progress < 50 ? 'Processing...' : progress < 80 ? 'Uploading...' : 'Saving...'}
                  </span>
                  <span className="text-sm text-gray-500 dark:text-gray-400">{Math.round(progress)}%</span>
                </div>
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                  <div
                    className="bg-gray-600 dark:bg-gray-500 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            )}

            {avatarUrl && !uploading && (
              <button
                onClick={handleRemove}
                className="w-full text-red-600 dark:text-red-400 text-sm font-medium hover:text-red-700 dark:hover:text-red-300 transition-colors"
              >
                Remove profile picture
              </button>
            )}

            {!uploading && (
              <button
                onClick={closeModal}
                className="absolute top-4 right-4 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>
      )}
    </>
  )
}

async function compressImage(file: File, maxSizeKB: number, maxDim: number): Promise<File> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = (e) => {
      const img = new Image()

      img.onload = () => {
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d')

        let { width, height } = img

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
        let compressedDataUrl: string | null = null

        const tryCompress = () => {
          compressedDataUrl = canvas.toDataURL('image/jpeg', quality)
          const blob = dataURLToBlob(compressedDataUrl)

          if (blob.size <= maxSizeKB * 1024 || quality <= 0.1) {
            const compressedFile = new File([blob], file.name, {
              type: 'image/jpeg',
              lastModified: Date.now()
            })
            resolve(compressedFile)
          } else {
            quality -= 0.1
            if (quality < 0.1) quality = 0.1
            tryCompress()
          }
        }

        tryCompress()
      }

      img.onerror = () => reject(new Error('Failed to load image'))
      img.src = e.target?.result as string
    }

    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsDataURL(file)
  })
}

function extractStoragePath(publicUrl: string): string | null {
  try {
    const url = new URL(publicUrl)
    const match = url.pathname.match(/\/storage\/v1\/object\/public\/avatars\/(.+)$/)
    if (match) return match[1]
    const directMatch = url.pathname.match(/\/avatars\/(.+)$/)
    if (directMatch) return directMatch[1]
    return null
  } catch {
    return null
  }
}
