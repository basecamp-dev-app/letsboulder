'use client'

import type React from 'react'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { createClient } from '@/lib/supabase'

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
        <div className="rounded-2xl border border-border/80 bg-card p-8 shadow-lg">
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
              <label className="mb-1 block text-sm font-medium text-foreground">
                Display Name
              </label>
              <Input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Alex, A. Rivera, StoneFox"
                autoFocus
                aria-invalid={Boolean(error) && !displayName.trim()}
                className="h-12 rounded-xl border-2 border-border bg-background px-4 text-base md:text-base"
              />
              <p className="mt-2 text-xs text-muted-foreground">
                Use your real name, initials, or a nickname you want attached to your climbing activity.
              </p>
            </div>

            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200">
                {error}
              </div>
            )}

            <Button
              type="submit"
              disabled={loading}
              className="h-12 w-full rounded-xl"
            >
              {loading ? 'Saving...' : 'Save and continue'}
            </Button>
          </form>
        </div>
      </div>
    </div>
  )
}
