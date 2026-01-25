'use client'

import { useState, useEffect } from 'react'
import { User } from '@supabase/supabase-js'
import { Loader2, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Checkbox } from '@/components/ui/checkbox'
import { csrfFetch } from '@/hooks/useCsrf'

interface SettingsContentProps {
  user: User
}

const CONFIRMATION_TEXT = 'delete my account'

function Toast({ message, onClose }: { message: string | null; onClose: () => void }) {
  useEffect(() => {
    if (message) {
      const timer = setTimeout(onClose, 2000)
      return () => clearTimeout(timer)
    }
  }, [message, onClose])

  if (!message) return null

  return (
    <div className="fixed bottom-4 right-4 p-3 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 rounded-lg shadow-lg text-sm z-50">
      {message}
    </div>
  )
}

const TABS = [
  { id: 'profile', label: 'Profile' },
  { id: 'appearance', label: 'Appearance' },
  { id: 'privacy', label: 'Privacy' },
]

export default function SettingsContent({ user }: SettingsContentProps) {
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('profile')

  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    gender: '',
    bio: ''
  })
  const [isDirty, setIsDirty] = useState(false)
  const [isPublic, setIsPublic] = useState(true)

  const [themePreference, setThemePreference] = useState('system')

  const [toast, setToast] = useState<string | null>(null)
  const [saveLoading, setSaveLoading] = useState(false)

  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [deleteRouteUploads, setDeleteRouteUploads] = useState(false)
  const [imageCount, setImageCount] = useState<number>(0)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const [deleteSent, setDeleteSent] = useState(false)

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await fetch('/api/settings')
        const data = await response.json()

        if (data.settings) {
          setFormData({
            firstName: data.settings.firstName || '',
            lastName: data.settings.lastName || '',
            gender: data.settings.gender || 'prefer_not_to_say',
            bio: data.settings.bio || ''
          })
           setIsPublic(data.settings.isPublic !== false)
           setThemePreference(data.settings.themePreference || 'system')
         }
         if (data.imageCount !== undefined) {
           setImageCount(data.imageCount)
        }
      } catch (error) {
        console.error('Error fetching settings:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [])

  const handleFormChange = (field: string, value: string | boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    setIsDirty(true)
  }

  const handleSave = async () => {
    setSaveLoading(true)
    try {
      const response = await csrfFetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: formData.firstName,
          lastName: formData.lastName,
          gender: formData.gender,
          bio: formData.bio,
          isPublic,
          themePreference
        })
      })

      if (!response.ok) {
        const data = await response.json()
        if (data.error) {
          setToast(data.error)
          return
        }
        throw new Error('Failed to save')
      }
      setIsDirty(false)
      setToast('Saved')
    } catch {
      setToast('Failed to save')
    } finally {
      setSaveLoading(false)
    }
  }

  const handleThemeChange = async (theme: string) => {
    setThemePreference(theme)
    setIsDirty(true)

    if (theme !== 'system') {
      document.documentElement.classList.remove('dark')
      if (theme === 'dark') {
        document.documentElement.classList.add('dark')
      }
    }
  }

  const handleVisibilityToggle = async () => {
    const newValue = !isPublic
    setIsPublic(newValue)
    setIsDirty(true)
  }

  const handleInitiateDelete = async () => {
    setDeleteLoading(true)
    try {
      const params = new URLSearchParams()
      if (deleteRouteUploads) {
        params.set('delete_route_uploads', 'true')
      }

      const response = await csrfFetch(`/api/settings/initiate-delete?${params.toString()}`, {
        method: 'POST'
      })

      if (!response.ok) throw new Error('Failed to send confirmation email')
      setDeleteSent(true)
    } catch (error) {
      console.error('Initiate delete error:', error)
      setDeleteLoading(false)
    }
  }

  const isConfirmed = confirmText.toLowerCase().trim() === CONFIRMATION_TEXT

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
        <div className="max-w-4xl mx-auto px-4 py-8">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-8">Settings</h1>
          <div className="space-y-8 animate-pulse">
            <div className="h-10 bg-gray-200 dark:bg-gray-800 rounded w-1/3" />
            <div className="h-32 bg-gray-200 dark:bg-gray-800 rounded" />
            <div className="h-10 bg-gray-200 dark:bg-gray-800 rounded w-1/3" />
            <div className="h-32 bg-gray-200 dark:bg-gray-800 rounded" />
          </div>
        </div>
      </div>
    )
  }

  if (deleteSent) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
        <div className="max-w-4xl mx-auto px-4 py-8">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-8">Settings</h1>
          <div className="max-w-2xl space-y-8">
            <div className="p-6 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg text-center">
              <svg className="w-12 h-12 text-green-600 dark:text-green-400 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              <h3 className="text-lg font-medium text-green-800 dark:text-green-200 mb-2">Confirmation Email Sent</h3>
              <p className="text-sm text-green-700 dark:text-green-300 mb-4">
                Check your email at <span className="font-medium">{user?.email}</span> and click the link to confirm account deletion.
              </p>
              <p className="text-xs text-green-600 dark:text-green-400">The link will expire in 10 minutes.</p>
            </div>
            <Button variant="outline" onClick={() => setDeleteSent(false)}>Send Again</Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-8">Settings</h1>

        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="border-b border-gray-200 dark:border-gray-700">
            <nav className="flex -mb-px overflow-x-auto">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-6 py-4 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                    activeTab === tab.id
                      ? 'border-gray-900 dark:border-gray-100 text-gray-900 dark:text-white'
                      : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:border-gray-300 dark:hover:border-gray-600'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </nav>
          </div>

          <div className="p-6">
            {activeTab === 'profile' && (
              <div className="space-y-6 max-w-xl">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">First Name</label>
                    <input
                      type="text"
                      value={formData.firstName}
                      onChange={(e) => handleFormChange('firstName', e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-gray-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Last Name</label>
                    <input
                      type="text"
                      value={formData.lastName}
                      onChange={(e) => handleFormChange('lastName', e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-gray-500 focus:border-transparent"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Gender</label>
                  <select
                    value={formData.gender}
                    onChange={(e) => handleFormChange('gender', e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-gray-500 focus:border-transparent"
                  >
                    <option value="prefer_not_to_say">Prefer not to say</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                  </select>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Used for segmented leaderboards</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Bio</label>
                  <textarea
                    value={formData.bio}
                    onChange={(e) => handleFormChange('bio', e.target.value)}
                    rows={4}
                    maxLength={500}
                    placeholder="Tell us about yourself..."
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-gray-500 focus:border-transparent resize-none"
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{formData.bio.length}/500 characters</p>
                </div>
              </div>
            )}

            {activeTab === 'appearance' && (
              <div className="space-y-6 max-w-xl">
                <p className="text-sm text-gray-500 dark:text-gray-400">Choose your preferred appearance.</p>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { value: 'light', label: 'Light', icon: '☀️' },
                    { value: 'dark', label: 'Dark', icon: '🌙' },
                    { value: 'system', label: 'System', icon: '💻' }
                  ].map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => handleThemeChange(option.value)}
                      className={`flex items-center justify-center gap-2 px-4 py-3 border rounded-lg transition-colors ${
                        themePreference === option.value
                          ? 'border-gray-900 dark:border-gray-100 bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white'
                          : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
                      }`}
                    >
                      <span>{option.icon}</span>
                      <span className="text-sm font-medium">{option.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {activeTab === 'privacy' && (
              <div className="space-y-8 max-w-xl">
                <div className="space-y-4">
                  <p className="text-sm font-medium text-gray-900 dark:text-white">Profile Visibility</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Your profile is currently {isPublic ? 'public' : 'private'}.
                  </p>
                  <div>
                    <Button variant="outline" onClick={handleVisibilityToggle} className="bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/10 dark:text-red-400 dark:hover:bg-red-900/20">
                      {isPublic ? 'Make Private' : 'Make Public'}
                    </Button>
                  </div>
                </div>

                <div className="pt-6 border-t border-gray-200 dark:border-gray-700">
                  <Dialog open={deleteModalOpen} onOpenChange={setDeleteModalOpen}>
                    <DialogTrigger asChild>
                      <button className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300">
                        <AlertTriangle className="w-4 h-4" />
                        Delete Account
                      </button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-md">
                      <DialogHeader>
                        <DialogTitle>Delete Account?</DialogTitle>
                        <DialogDescription className="text-left">
                          This will permanently delete your account and all of your data, including:
                          <ul className="list-disc pl-5 mt-2 space-y-1 text-sm">
                            <li>Your profile and climb logs</li>
                            <li>Grade votes and verifications</li>
                            <li>Climb corrections and reports</li>
                            <li>Your avatar image</li>
                          </ul>

                          <div className="mt-4 p-3 bg-gray-100 dark:bg-gray-800 rounded-lg">
                            <label className="flex items-start gap-3 cursor-pointer">
                              <Checkbox
                                checked={deleteRouteUploads}
                                onCheckedChange={(checked) => setDeleteRouteUploads(checked === true)}
                              />
                              <div className="text-sm">
                                <span className="font-medium text-gray-900 dark:text-white">Also delete my uploaded images</span>
                                {imageCount !== null && imageCount > 0 && (
                                  <p className="text-gray-500 dark:text-gray-400 mt-0.5">{imageCount} images will be permanently deleted</p>
                                )}
                                {imageCount === 0 && (
                                  <p className="text-gray-500 dark:text-gray-400 mt-0.5">No images to delete</p>
                                )}
                                {!deleteRouteUploads && imageCount !== null && imageCount > 0 && (
                                  <p className="text-gray-500 dark:text-gray-400 mt-0.5">Your images will remain but become anonymous</p>
                                )}
                              </div>
                            </label>
                          </div>

                          <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                            <p className="text-sm font-medium text-red-800 dark:text-red-200 mb-2">
                              To confirm, type: <code className="bg-red-100 dark:bg-red-800 px-2 py-0.5 rounded">{CONFIRMATION_TEXT}</code>
                            </p>
                            <input
                              type="text"
                              value={confirmText}
                              onChange={(e) => setConfirmText(e.target.value)}
                              placeholder={CONFIRMATION_TEXT}
                              className="w-full px-3 py-2 border border-red-300 dark:border-red-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-400"
                            />
                          </div>

                          <p className="mt-4 font-medium text-red-600 dark:text-red-400">
                            This action cannot be undone. A confirmation email will be sent.
                          </p>
                        </DialogDescription>
                      </DialogHeader>
                      <DialogFooter className="flex flex-col-reverse sm:flex-row gap-2">
                        <Button variant="outline" onClick={() => { setDeleteModalOpen(false); setConfirmText('') }}>
                          Cancel
                        </Button>
                        <Button
                          variant="destructive"
                          onClick={handleInitiateDelete}
                          disabled={!isConfirmed || deleteLoading}
                        >
                          {deleteLoading ? 'Sending...' : 'Send Confirmation Email'}
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </div>
              </div>
            )}
          </div>

          <div className="px-6 py-4 bg-gray-50 dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 flex justify-end">
            <Button
              onClick={handleSave}
              disabled={!isDirty || saveLoading}
              className="min-w-[120px]"
            >
              {saveLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save Changes'
              )}
            </Button>
          </div>
        </div>
      </div>

      <Toast message={toast} onClose={() => setToast(null)} />
    </div>
  )
}
