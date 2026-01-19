'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { User } from '@supabase/supabase-js'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { csrfFetch } from '@/hooks/useCsrf'

interface AccountSectionProps {
  user: User
}

const CONFIRMATION_TEXT = 'delete my account'

export function AccountSection({ user }: AccountSectionProps) {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    gender: '',
    bio: '',
    defaultLocation: ''
  })
  const [isPublic, setIsPublic] = useState(true)
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [deleteRouteUploads, setDeleteRouteUploads] = useState(false)
  const [imageCount, setImageCount] = useState<number | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const [deleteSent, setDeleteSent] = useState(false)

  const fetchImageCount = useCallback(async () => {
    const { count } = await supabase
      .from('images')
      .select('*', { count: 'exact', head: true })
      .eq('created_by', user.id)

    setImageCount(count || 0)
  }, [user.id, supabase])

  useEffect(() => {
    const fetchData = async () => {
      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()

      if (profileData) {
        setFormData({
          firstName: profileData.first_name || '',
          lastName: profileData.last_name || '',
          gender: profileData.gender || 'prefer_not_to_say',
          bio: profileData.bio || '',
          defaultLocation: profileData.default_location || ''
        })
        setIsPublic(profileData.is_public !== false)
      }

      setLoading(false)
    }

    fetchData()
    fetchImageCount()
  }, [user.id, supabase, fetchImageCount])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setMessage(null)

    try {
      const response = await csrfFetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      })

      if (!response.ok) throw new Error('Failed to save')

      setMessage({ type: 'success', text: 'Settings saved successfully' })
    } catch {
      setMessage({ type: 'error', text: 'Failed to save settings' })
    } finally {
      setSaving(false)
    }
  }

  const handleVisibilityToggle = async () => {
    setSaving(true)
    setMessage(null)

    try {
      const response = await csrfFetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isPublic: !isPublic })
      })

      if (!response.ok) throw new Error('Failed to save')

      setIsPublic(!isPublic)
      setMessage({ type: 'success', text: 'Visibility settings saved' })
    } catch {
      setMessage({ type: 'error', text: 'Failed to save visibility settings' })
    } finally {
      setSaving(false)
    }
  }

  const handleInitiateDelete = async () => {
    setDeleteLoading(true)
    try {
      const params = new URLSearchParams()
      if (deleteRouteUploads) {
        params.set('delete_route_uploads', 'true')
      }

      const response = await csrfFetch(`/api/settings/initiate-delete?${params.toString()}`, {
        method: 'POST',
      })

      if (!response.ok) {
        throw new Error('Failed to send confirmation email')
      }

      setDeleteSent(true)
    } catch (error) {
      console.error('Initiate delete error:', error)
      setDeleteLoading(false)
    }
  }

  const isConfirmed = confirmText.toLowerCase().trim() === CONFIRMATION_TEXT

  if (loading) {
    return <div className="animate-pulse space-y-4"><div className="h-10 bg-gray-200 dark:bg-gray-800 rounded" /><div className="h-10 bg-gray-200 dark:bg-gray-800 rounded" /><div className="h-32 bg-gray-200 dark:bg-gray-800 rounded" /></div>
  }

  if (deleteSent) {
    return (
      <div className="space-y-6">
        <div className="py-4">
          <h3 className="text-sm font-medium text-red-600 dark:text-red-400 mb-2">Delete Account</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            Permanently delete your account and all associated data. This action cannot be undone.
          </p>
        </div>
        <div className="p-6 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg text-center">
          <svg className="w-12 h-12 text-green-600 dark:text-green-400 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
          <h3 className="text-lg font-medium text-green-800 dark:text-green-200 mb-2">Confirmation Email Sent</h3>
          <p className="text-sm text-green-700 dark:text-green-300 mb-4">
            Check your email at <span className="font-medium">{user?.email}</span> and click the link to confirm account deletion.
          </p>
          <p className="text-xs text-green-600 dark:text-green-400">
            The link will expire in 10 minutes.
          </p>
        </div>
        <Button variant="outline" onClick={() => setDeleteSent(false)}>
          Send Again
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Account Information</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">Update your profile information below.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">First Name</label>
            <input
              type="text"
              value={formData.firstName}
              onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-gray-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Last Name</label>
            <input
              type="text"
              value={formData.lastName}
              onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-gray-500 focus:border-transparent"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Gender</label>
          <select
            value={formData.gender}
            onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
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
            onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
            rows={4}
            maxLength={500}
            placeholder="Tell us about yourself..."
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-gray-500 focus:border-transparent resize-none"
          />
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{formData.bio.length}/500 characters</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Default Location</label>
          <input
            type="text"
            value={formData.defaultLocation}
            onChange={(e) => setFormData({ ...formData, defaultLocation: e.target.value })}
            placeholder="e.g., Fontainebleau, France"
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-gray-500 focus:border-transparent"
          />
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Your primary climbing location</p>
        </div>

        {message && (
          <div className={`p-3 rounded-lg text-sm ${message.type === 'success' ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400' : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400'}`}>
            {message.text}
          </div>
        )}

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded-lg font-medium hover:bg-gray-800 dark:hover:bg-gray-200 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </form>

      <div className="border-t border-gray-200 dark:border-gray-700" />

      <div className="space-y-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Danger Zone</h2>

        <div className="border border-red-200 dark:border-red-800 rounded-lg p-6 space-y-6">
          <div>
            <h3 className="text-sm font-medium text-gray-900 dark:text-white">Change Profile Visibility</h3>
            <p className="text-xs text-gray-600 dark:text-white/70 mt-1">
              This profile is currently {isPublic ? 'public' : 'private'}.
            </p>
            <Button variant="outline" onClick={handleVisibilityToggle} disabled={saving} className="bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/10 dark:text-red-400 dark:hover:bg-red-900/20">
              Change Visibility
            </Button>
          </div>

          <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
            <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-2">Delete Account</h3>
            <p className="text-sm text-gray-600 dark:text-white/70 mb-4">
              Permanently delete your account and all associated data. This action cannot be undone.
            </p>

            <Dialog open={deleteModalOpen} onOpenChange={setDeleteModalOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" className="bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/10 dark:text-red-400 dark:hover:bg-red-900/20">
                  Delete Account
                </Button>
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
                          <span className="font-medium text-gray-900 dark:text-white">
                            Also delete my uploaded images
                          </span>
                          {imageCount !== null && imageCount > 0 && (
                            <p className="text-gray-500 dark:text-gray-400 mt-0.5">
                              {imageCount} images will be permanently deleted
                            </p>
                          )}
                          {imageCount === 0 && (
                            <p className="text-gray-500 dark:text-gray-400 mt-0.5">
                              No images to delete
                            </p>
                          )}
                          {!deleteRouteUploads && imageCount !== null && imageCount > 0 && (
                            <p className="text-gray-500 dark:text-gray-400 mt-0.5">
                              Your images will remain but become anonymous
                            </p>
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
                  <Button variant="outline" onClick={() => {
                    setDeleteModalOpen(false)
                    setConfirmText('')
                  }}>
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
      </div>
    </div>
  )
}
