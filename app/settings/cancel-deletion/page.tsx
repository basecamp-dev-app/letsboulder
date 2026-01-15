'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { User } from '@supabase/supabase-js'

export function CancelDeletionHandler() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  const handleCancel = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/settings/cancel-deletion', {
        method: 'POST',
      })

      if (response.ok) {
        router.push('/settings/deletion-cancelled')
      } else {
        const error = await response.json()
        alert(error.error || 'Failed to cancel deletion')
        router.push('/')
      }
    } catch {
      router.push('/')
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={handleCancel}
      disabled={loading}
      className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
    >
      {loading ? 'Cancelling...' : 'Cancel Deletion'}
    </button>
  )
}

export default function CancelDeletionPage() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex flex-col items-center justify-center px-4">
      <div className="max-w-md w-full text-center">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
          Cancel Account Deletion
        </h1>
        <p className="text-gray-500 dark:text-gray-400 mb-6">
          Are you sure you want to cancel your account deletion request? Your account will remain active.
        </p>
        <div className="flex gap-4 justify-center">
          <a
            href="/"
            className="px-6 py-2 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white rounded-lg font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            Keep Account (Cancel)
          </a>
          <button
            onClick={async () => {
              try {
                const response = await fetch('/api/settings/cancel-deletion', {
                  method: 'POST',
                })
                if (response.ok) {
                  window.location.href = '/settings/deletion-cancelled'
                }
              } catch {
                window.location.href = '/'
              }
            }}
            className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
          >
            Confirm Cancellation
          </button>
        </div>
      </div>
    </div>
  )
}
