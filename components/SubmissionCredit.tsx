'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { SubmissionCreditPlatform, normalizeSubmissionCreditHandle, formatSubmissionCreditHandle } from '@/lib/submission-credit'
import { csrfFetch } from '@/hooks/useCsrf'

const CREDIT_PLATFORM_OPTIONS: Array<{ value: SubmissionCreditPlatform; label: string }> = [
  { value: 'instagram', label: 'Instagram' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'youtube', label: 'YouTube' },
  { value: 'x', label: 'X' },
  { value: 'other', label: 'Other' },
]

interface SubmissionCreditProps {
  imageId: string
  onCreditSaved?: (platform: string | null, handle: string | null) => void
}

export default function SubmissionCredit({ imageId, onCreditSaved }: SubmissionCreditProps) {
  const [platform, setPlatform] = useState<SubmissionCreditPlatform | ''>('')
  const [handle, setHandle] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    async function fetchDefaultCredit() {
      try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        const response = await fetch('/api/settings')
        if (!response.ok) return

        const data = await response.json()
        const settings = data.settings

        if (settings?.contributionCreditPlatform && settings?.contributionCreditHandle) {
          setPlatform(settings.contributionCreditPlatform as SubmissionCreditPlatform)
          setHandle(settings.contributionCreditHandle)
        }
      } catch (err) {
        console.error('Error fetching default credit:', err)
      } finally {
        setIsLoading(false)
      }
    }

    fetchDefaultCredit()
  }, [])

  const handleSave = async () => {
    if (isSaving) return

    const normalizedHandle = normalizeSubmissionCreditHandle(handle)
    const normalizedPlatform = normalizedHandle ? platform : null

    if (normalizedHandle && !normalizedPlatform) {
      setError('Please select a platform')
      return
    }

    setIsSaving(true)
    setError(null)

    try {
      const response = await csrfFetch(`/api/submissions/${imageId}/credit`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platform: normalizedPlatform || null,
          handle: normalizedHandle || null,
        }),
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to save credit')
      }

      const data = await response.json()
      setSaved(true)
      onCreditSaved?.(data.credit?.platform, data.credit?.handle)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save credit')
    } finally {
      setIsSaving(false)
    }
  }

  if (isLoading) {
    return (
      <div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-4 animate-pulse">
        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/3 mb-3" />
        <div className="h-10 bg-gray-200 dark:bg-gray-700 rounded w-full mb-2" />
        <div className="h-10 bg-gray-200 dark:bg-gray-700 rounded w-full" />
      </div>
    )
  }

  if (saved && platform && handle) {
    return (
      <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
        <div className="flex items-center gap-2 text-green-700 dark:text-green-400">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <p className="font-medium">Contributions credited to @{normalizeSubmissionCreditHandle(handle)}</p>
        </div>
        <button
          onClick={() => setSaved(false)}
          className="text-sm text-green-600 dark:text-green-400 hover:underline mt-2"
        >
          Edit
        </button>
      </div>
    )
  }

  return (
    <div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-4">
      <div className="flex items-center gap-2 mb-3">
        <svg className="w-5 h-5 text-gray-600 dark:text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
        </svg>
        <p className="text-sm font-medium text-gray-900 dark:text-white">Credit your contribution</p>
      </div>

      <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
        Add your social handle to build trust and help others find your content.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-2">
        <select
          value={platform}
          onChange={(e) => {
            setPlatform(e.target.value as SubmissionCreditPlatform | '')
            setSaved(false)
          }}
          className="sm:col-span-1 w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        >
          <option value="">Platform</option>
          {CREDIT_PLATFORM_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
        <input
          type="text"
          value={handle}
          onChange={(e) => {
            setHandle(e.target.value)
            setSaved(false)
          }}
          placeholder="handle"
          className="sm:col-span-2 w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>

      {handle && (
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
          Shows as {formatSubmissionCreditHandle(handle) || '@handle'}
        </p>
      )}

      {error && (
        <p className="text-xs text-red-600 dark:text-red-400 mb-3">{error}</p>
      )}

      <button
        onClick={handleSave}
        disabled={isSaving || (!platform && !handle)}
        className={`w-full py-2 px-4 rounded-lg text-sm font-medium transition-colors ${
          isSaving || (!platform && !handle)
            ? 'bg-gray-300 dark:bg-gray-600 text-gray-500 dark:text-gray-400 cursor-not-allowed'
            : 'bg-blue-600 text-white hover:bg-blue-700'
        }`}
      >
        {isSaving ? 'Saving...' : 'Save Credit'}
      </button>
    </div>
  )
}
