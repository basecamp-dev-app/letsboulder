'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { User } from '@supabase/supabase-js'

interface AccountActionsSectionProps {
  user: User | null
}

export function AccountActionsSection({ user }: AccountActionsSectionProps) {
  const router = useRouter()
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const handleDeleteAccount = async () => {
    setDeleting(true)
    setMessage(null)

    try {
      const response = await fetch('/api/settings/delete', {
        method: 'DELETE'
      })

      if (!response.ok) throw new Error('Failed to delete account')

      const supabase = createClient()
      await supabase.auth.signOut()
      router.push('/')
    } catch {
      setMessage({ type: 'error', text: 'Failed to delete account. Please try again.' })
    } finally {
      setDeleting(false)
      setShowDeleteConfirm(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Account Actions</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">Manage your account settings.</p>
      </div>

      <div className="space-y-4">
        <div className="py-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-1">Email</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">{user?.email}</p>
          <p className="text-xs text-gray-400 dark:text-gray-500">Contact support to change your email address.</p>
        </div>

        <div className="py-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-1">Password</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">Your account uses magic link authentication.</p>
          <p className="text-xs text-gray-400 dark:text-gray-500">No password required - sign in via email link.</p>
        </div>

        <div className="py-4">
          <h3 className="text-sm font-medium text-red-600 dark:text-red-400 mb-2">Delete Account</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            Permanently delete your account and all associated data. This action cannot be undone.
          </p>
          {!showDeleteConfirm ? (
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(true)}
              className="px-4 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-colors"
            >
              Delete Account
            </button>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-gray-900 dark:text-white">Are you sure you want to delete your account? This action is permanent.</p>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={handleDeleteAccount}
                  disabled={deleting}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 disabled:opacity-50 transition-colors"
                >
                  {deleting ? 'Deleting...' : 'Yes, Delete My Account'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(false)}
                  className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {message && (
        <div className={`p-3 rounded-lg text-sm ${message.type === 'success' ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400' : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400'}`}>
          {message.text}
        </div>
      )}
    </div>
  )
}
