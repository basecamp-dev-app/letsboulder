'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

export default function SetNamePage() {
  const [displayName, setDisplayName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  useEffect(() => {
    const checkSession = async () => {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        router.push('/auth')
      }
    }
    checkSession()
  }, [router])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!displayName.trim()) {
      setError('Please enter the name you want shown on letsboulder')
      return
    }

    setLoading(true)
    const supabase = createClient()

    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      setError('Session expired. Please sign in again.')
      setLoading(false)
      return
    }

    const { error: upsertError } = await supabase
      .from('profiles')
      .upsert({
        id: user.id,
        display_name: displayName.trim(),
      })

    if (upsertError) {
      setError('Failed to save your name. Please try again.')
      setLoading(false)
    } else {
      router.push('/')
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 px-4">
      <div className="w-full max-w-md">
        <div className="bg-white dark:bg-gray-900 rounded-xl shadow-lg p-8">
          <p className="text-center text-xs font-semibold uppercase tracking-[0.2em] text-gray-500 dark:text-gray-400">
            Step 2 of 2
          </p>
          <h1 className="text-2xl font-bold text-center mb-2 text-gray-900 dark:text-gray-100">
            What should we call you?
          </h1>
          <p className="text-center text-gray-600 dark:text-gray-400 text-sm">
            One last thing before you continue. This is the name other climbers will see on your profile, activity, and verifications.
          </p>
          <p className="text-center text-gray-500 dark:text-gray-400 mb-6 text-sm">
            You can change it later in your profile settings.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Display Name
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Alex, A. Rivera, StoneFox"
                autoFocus
                className="w-full px-4 py-3 text-lg border-2 rounded-lg focus:outline-none transition-colors bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-600 focus:border-gray-500"
              />
              <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                Use your real name, initials, or a nickname you want attached to your climbing activity.
              </p>
            </div>

            {error && (
              <div className="text-red-600 dark:text-red-400 text-sm bg-red-50 dark:bg-red-900/20 p-3 rounded-lg">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gray-800 dark:bg-gray-700 text-white dark:text-gray-100 py-3 px-6 rounded-lg font-semibold hover:bg-gray-700 dark:hover:bg-gray-600 transition-colors disabled:opacity-50"
            >
              {loading ? 'Saving...' : 'Save and continue'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
