'use client'

import { useState, useEffect } from 'react'
import { csrfFetch, useCsrfToken } from '@/hooks/useCsrf'

export function PreferencesSection() {
  const csrfToken = useCsrfToken()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [formData, setFormData] = useState({
    themePreference: 'system'
  })

  useEffect(() => {
    const fetchSettings = async () => {
      const response = await fetch('/api/settings')
      if (response.ok) {
        const data = await response.json()
        setFormData({
          themePreference: data.settings.themePreference || 'system'
        })
      }
      setLoading(false)
    }

    fetchSettings()
  }, [])

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

      setMessage({ type: 'success', text: 'Preferences saved successfully' })

      if (formData.themePreference !== 'system') {
        document.documentElement.classList.remove('dark')
        if (formData.themePreference === 'dark') {
          document.documentElement.classList.add('dark')
        }
      }
    } catch {
      setMessage({ type: 'error', text: 'Failed to save preferences' })
    } finally {
      setSaving(false)
    }
  }

  if (loading || csrfToken === null) {
    return <div className="animate-pulse space-y-4"><div className="h-10 bg-gray-200 dark:bg-gray-800 rounded" /><div className="h-10 bg-gray-200 dark:bg-gray-800 rounded" /></div>
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Preferences</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">Customize your app experience.</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Theme</label>
        <div className="grid grid-cols-3 gap-2">
          {[
            { value: 'light', label: 'Light', icon: '☀️' },
            { value: 'dark', label: 'Dark', icon: '🌙' },
            { value: 'system', label: 'System', icon: '💻' }
          ].map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setFormData({ ...formData, themePreference: option.value })}
              className={`flex items-center justify-center gap-2 px-4 py-3 border rounded-lg transition-colors ${
                formData.themePreference === option.value
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
          {saving ? 'Saving...' : 'Save Preferences'}
        </button>
      </div>
    </form>
  )
}
