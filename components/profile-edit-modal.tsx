'use client'

import { useEffect, useState } from 'react'
import { useOverlayHistory } from '@/hooks/useOverlayHistory'
import { csrfFetch } from '@/hooks/useCsrf'

interface ProfileEditModalProps {
  open: boolean
  username: string
  firstName?: string
  lastName?: string
  gender?: string
  onClose: () => void
  onUsernameUpdate?: (newUsername: string, firstName?: string, lastName?: string, gender?: string) => void
}

function validateUsername(value: string): string | null {
  const trimmed = value.trim()
  if (trimmed.length === 0) return 'Username cannot be empty'
  if (trimmed.length < 3 || trimmed.length > 30) return 'Username must be between 3 and 30 characters'
  if (!/^[A-Za-z0-9._-]+$/.test(trimmed)) {
    return 'Username can only contain letters, numbers, underscores, periods, and hyphens'
  }
  return null
}

export function ProfileEditModal({
  open,
  username,
  firstName,
  lastName,
  gender,
  onClose,
  onUsernameUpdate,
}: ProfileEditModalProps) {
  const [editUsername, setEditUsername] = useState('')
  const [editFirstName, setEditFirstName] = useState('')
  const [editLastName, setEditLastName] = useState('')
  const [editGender, setEditGender] = useState('')
  const [usernameError, setUsernameError] = useState<string | null>(null)
  const [usernameSuggestions, setUsernameSuggestions] = useState<string[]>([])
  const [isSavingProfile, setIsSavingProfile] = useState(false)

  const closeProfileModal = () => {
    setUsernameError(null)
    setUsernameSuggestions([])
    onClose()
  }

  useEffect(() => {
    if (!open) return

    setEditUsername(username || '')
    setEditFirstName(firstName || '')
    setEditLastName(lastName || '')
    setEditGender(gender || '')
    setUsernameError(null)
    setUsernameSuggestions([])
  }, [firstName, gender, lastName, open, username])

  useOverlayHistory({ open, onClose: closeProfileModal, id: 'profile-edit-modal' })

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

      const data = await response.json() as { error?: string; suggestions?: string[] }

      if (!response.ok) {
        if (response.status === 409 && data.suggestions) {
          setUsernameError('Username is already taken')
          setUsernameSuggestions(data.suggestions)
          setIsSavingProfile(false)
          return
        }

        throw new Error(data.error || 'Failed to update profile')
      }

      onUsernameUpdate?.(editUsername, editFirstName, editLastName, editGender)
      closeProfileModal()
    } catch (caughtError) {
      setUsernameError(caughtError instanceof Error ? caughtError.message : 'Failed to update profile')
    } finally {
      setIsSavingProfile(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={closeProfileModal} />
      <div className="relative bg-white dark:bg-gray-900 rounded-lg shadow-xl max-w-sm w-full p-6">
        <h2 className="text-xl font-bold mb-4 text-gray-900 dark:text-gray-100">Edit Profile</h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">First Name</label>
            <input type="text" value={editFirstName} onChange={(event) => setEditFirstName(event.target.value)} placeholder="Optional" className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-500" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Last Name</label>
            <input type="text" value={editLastName} onChange={(event) => setEditLastName(event.target.value)} placeholder="Optional" className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-500" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Gender</label>
            <select value={editGender} onChange={(event) => setEditGender(event.target.value)} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-500">
              <option value="">Prefer not to say</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="other">Other</option>
            </select>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Used for segmented leaderboards (optional)</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Username</label>
            <input
              type="text"
              value={editUsername}
              onChange={(event) => {
                setEditUsername(event.target.value)
                setUsernameError(null)
                setUsernameSuggestions([])
              }}
              onBlur={() => setUsernameError(validateUsername(editUsername))}
              placeholder="Choose a username"
              className={`w-full px-3 py-2 border rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-500 ${usernameError ? 'border-red-500 dark:border-red-500' : 'border-gray-300 dark:border-gray-600'}`}
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">3-30 characters. Letters, numbers, underscores, periods, and hyphens only.</p>
            {usernameError && <p className="mt-1 text-sm text-red-600 dark:text-red-400">{usernameError}</p>}
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
          <button onClick={closeProfileModal} className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg font-medium hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">Cancel</button>
          <button onClick={saveProfile} disabled={isSavingProfile} className="flex-1 px-4 py-2 bg-gray-800 dark:bg-gray-700 text-white dark:text-gray-100 rounded-lg font-medium hover:bg-gray-700 dark:hover:bg-gray-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
            {isSavingProfile ? 'Saving...' : 'Save'}
          </button>
        </div>

        <button onClick={closeProfileModal} className="absolute top-4 right-4 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  )
}
