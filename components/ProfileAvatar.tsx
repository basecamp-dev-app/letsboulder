'use client'

import { useState, useRef, useEffect, useImperativeHandle, forwardRef, useCallback } from 'react'
import NextImage from 'next/image'
import { createClient } from '@/lib/supabase'
import { dataURLToBlob } from '@/lib/image-utils'
import { useOverlayHistory } from '@/hooks/useOverlayHistory'
import { csrfFetch } from '@/hooks/useCsrf'

interface ProfileAvatarProps {
  avatarUrl?: string
  initials: string
  averageGrade: string
  averagePoints: number
  previousGrade: string
  nextGrade: string
  previousGradePoints: number
  nextGradePoints: number
  username: string
  firstName?: string
  lastName?: string
  gender?: string
  onAvatarUpdate: (newUrl: string) => void
  onUsernameUpdate?: (newUsername: string, firstName?: string, lastName?: string, gender?: string) => void
}

export interface ProfileAvatarRef {
  openProfileEdit: () => void
}

const ProfileAvatarComponent = forwardRef<ProfileAvatarRef, ProfileAvatarProps>(function ProfileAvatar({
  avatarUrl,
  initials,
  averageGrade,
  averagePoints,
  previousGradePoints,
  nextGradePoints,
  username,
  firstName,
  lastName,
  gender,
  onAvatarUpdate,
  onUsernameUpdate,
}: ProfileAvatarProps, ref) {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false)
  const [editUsername, setEditUsername] = useState('')
  const [editFirstName, setEditFirstName] = useState('')
  const [editLastName, setEditLastName] = useState('')
  const [editGender, setEditGender] = useState('')
  const [usernameError, setUsernameError] = useState<string | null>(null)
  const [usernameSuggestions, setUsernameSuggestions] = useState<string[]>([])
  const [isSavingProfile, setIsSavingProfile] = useState(false)

  useImperativeHandle(ref, () => ({
    openProfileEdit: () => {
      setEditUsername(username || '')
      setEditFirstName(firstName || '')
      setEditLastName(lastName || '')
      setEditGender(gender || '')
      setUsernameError(null)
      setUsernameSuggestions([])
      setIsProfileModalOpen(true)
    },
  }))

  const radius = 44
  const circumference = 2 * Math.PI * radius
  const strokeWidth = 4

  const percent = nextGradePoints > previousGradePoints
    ? Math.min(Math.max(((averagePoints - previousGradePoints) / (nextGradePoints - previousGradePoints)) * 100, 0), 100)
    : 0

  const strokeDashoffset = circumference - (percent / 100) * circumference

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
      setPreview(e.target?.result as string)
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
        setIsModalOpen(false)
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

      if (avatarUrl) {
        const oldPath = extractStoragePath(avatarUrl)
        if (oldPath) {
          await supabase.storage.from('avatars').remove([oldPath])
        }
      }

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
        setIsModalOpen(false)
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
      setIsModalOpen(false)
      setFile(null)
      setPreview(null)
      setError(null)
      setProgress(0)
    }
  }, [uploading])

  const closeProfileModal = () => {
    setIsProfileModalOpen(false)
    setUsernameError(null)
    setUsernameSuggestions([])
  }

  useOverlayHistory({ open: isModalOpen, onClose: closeModal, id: 'profile-avatar-uploader' })
  useOverlayHistory({ open: isProfileModalOpen, onClose: closeProfileModal, id: 'profile-edit-modal' })

  const validateUsername = (value: string): string | null => {
    const trimmed = value.trim()
    if (trimmed.length === 0) return 'Username cannot be empty'
    if (trimmed.length < 3 || trimmed.length > 30) return 'Username must be between 3 and 30 characters'
    const usernameRegex = /^[A-Za-z0-9._-]+$/
    if (!usernameRegex.test(trimmed)) return 'Username can only contain letters, numbers, underscores, periods, and hyphens'
    return null
  }

  const saveProfile = async () => {
    const validationError = validateUsername(editUsername)
    if (validationError) {
      setUsernameError(validationError)
      return
    }

    setIsSavingProfile(true)
    setUsernameError(null)

    try {
      const response = await csrfFetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: editUsername,
          first_name: editFirstName,
          last_name: editLastName,
          gender: editGender || null,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        if (response.status === 409 && data.suggestions) {
          setUsernameError('Username is already taken')
          setUsernameSuggestions(data.suggestions)
          setIsSavingProfile(false)
          return
        }
        throw new Error(data.error || 'Failed to update profile')
      }

      if (onUsernameUpdate) {
        onUsernameUpdate(editUsername, editFirstName, editLastName, editGender)
      }
      closeProfileModal()
    } catch (err) {
      setUsernameError(err instanceof Error ? err.message : 'Failed to update profile')
    } finally {
      setIsSavingProfile(false)
    }
  }

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeModal()
    }
    if (isModalOpen) {
      document.addEventListener('keydown', handleEscape)
      document.body.style.overflow = 'hidden'
    }
    return () => {
      document.removeEventListener('keydown', handleEscape)
      document.body.style.overflow = 'unset'
    }
  }, [isModalOpen, closeModal])

  return (
    <>
      <div className="relative w-32 h-32">
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-20">
          <div className="bg-white dark:bg-gray-800 px-3 py-0.5 rounded-full shadow-md border border-gray-200 dark:border-gray-700">
            <span className="text-sm font-bold text-gray-900 dark:text-gray-100">
              {averageGrade}
            </span>
          </div>
        </div>

        <div className="relative w-32 h-32">
          <svg className="w-full h-full transform -rotate-90" viewBox="0 0 96 96">
            <circle
              cx="48"
              cy="48"
              r={radius}
              fill="none"
              stroke="currentColor"
              strokeWidth={strokeWidth}
              className="text-gray-200 dark:text-gray-700"
            />
            <circle
              cx="48"
              cy="48"
              r={radius}
              fill="none"
              stroke="currentColor"
              strokeWidth={strokeWidth}
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
              className="text-gray-800 dark:text-gray-400 transition-all duration-500"
              style={{ transition: 'stroke-dashoffset 0.5s ease-in-out' }}
            />
          </svg>

          <button
            onClick={() => setIsModalOpen(true)}
            className="absolute inset-[6px] rounded-full overflow-hidden transition-opacity hover:opacity-95 group"
            aria-label="Edit profile picture"
          >
            {avatarUrl ? (
              <NextImage
                src={avatarUrl}
                alt="Profile"
                width={128}
                height={128}
                unoptimized
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-gray-700 dark:text-gray-200 font-bold text-xl">
                {initials}
              </div>
            )}
            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <span className="text-white text-xs font-medium">Edit</span>
            </div>
          </button>
        </div>

        <div className="mt-2 text-center">
          <span className="text-lg font-semibold text-gray-900 dark:text-gray-100 block">
            {username || 'Set username'}
          </span>
        </div>

      </div>

      {isModalOpen && (
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
                <NextImage
                  src={preview}
                  alt="Preview"
                  width={128}
                  height={128}
                  unoptimized
                  className="w-32 h-32 rounded-full object-cover"
                />
              ) : avatarUrl ? (
                <NextImage
                  src={avatarUrl}
                  alt="Current avatar"
                  width={128}
                  height={128}
                  unoptimized
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

      {isProfileModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={closeProfileModal}
          />
          <div className="relative bg-white dark:bg-gray-900 rounded-lg shadow-xl max-w-sm w-full p-6">
            <h2 className="text-xl font-bold mb-4 text-gray-900 dark:text-gray-100">
              Edit Profile
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  First Name
                </label>
                <input
                  type="text"
                  value={editFirstName}
                  onChange={(e) => setEditFirstName(e.target.value)}
                  placeholder="Optional"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Last Name
                </label>
                <input
                  type="text"
                  value={editLastName}
                  onChange={(e) => setEditLastName(e.target.value)}
                  placeholder="Optional"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Gender
                </label>
                <select
                  value={editGender}
                  onChange={(e) => setEditGender(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-500"
                >
                  <option value="">Prefer not to say</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                </select>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Used for segmented leaderboards (optional)
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Username
                </label>
                <input
                  type="text"
                  value={editUsername}
                  onChange={(e) => {
                    setEditUsername(e.target.value)
                    setUsernameError(null)
                    setUsernameSuggestions([])
                  }}
                  onBlur={() => setUsernameError(validateUsername(editUsername))}
                  placeholder="Choose a username"
                  className={`w-full px-3 py-2 border rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-500 ${
                    usernameError ? 'border-red-500 dark:border-red-500' : 'border-gray-300 dark:border-gray-600'
                  }`}
                />
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  3-30 characters. Letters, numbers, underscores, periods, and hyphens only.
                </p>
                {usernameError && (
                  <p className="mt-1 text-sm text-red-600 dark:text-red-400">{usernameError}</p>
                )}
                {usernameSuggestions.length > 0 && (
                  <div className="mt-2">
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Try these instead:</p>
                    <div className="flex flex-wrap gap-2">
                      {usernameSuggestions.map((suggestion) => (
                        <button
                          key={suggestion}
                          onClick={() => {
                            setEditUsername(suggestion)
                            setUsernameError(null)
                            setUsernameSuggestions([])
                          }}
                          className="px-2 py-1 text-xs bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                        >
                          {suggestion}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={closeProfileModal}
                className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg font-medium hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={saveProfile}
                disabled={isSavingProfile}
                className="flex-1 px-4 py-2 bg-gray-800 dark:bg-gray-700 text-white dark:text-gray-100 rounded-lg font-medium hover:bg-gray-700 dark:hover:bg-gray-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSavingProfile ? 'Saving...' : 'Save'}
              </button>
            </div>

            <button
              onClick={closeProfileModal}
              className="absolute top-4 right-4 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </>
  )
})

export default ProfileAvatarComponent

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
