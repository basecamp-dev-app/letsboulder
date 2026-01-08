'use client'

import { useState, useEffect } from 'react'

export function PrivacySection() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [formData, setFormData] = useState({
    isPublic: true
  })

  useEffect(() => {
    const fetchSettings = async () => {
      const response = await fetch('/api/settings')
      if (response.ok) {
        const data = await response.json()
        setFormData({
          isPublic: data.settings.isPublic !== false
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
      const response = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      })

      if (!response.ok) throw new Error('Failed to save')

      setMessage({ type: 'success', text: 'Privacy settings saved' })
    } catch {
      setMessage({ type: 'error', text: 'Failed to save privacy settings' })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="animate-pulse space-y-4"><div className="h-10 bg-gray-200 dark:bg-gray-800 rounded" /></div>
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Privacy</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">Control your profile visibility and data.</p>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between py-3 border-b border-gray-200 dark:border-gray-700">
          <div>
            <h3 className="text-sm font-medium text-gray-900 dark:text-white">Public Profile</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">Allow anyone to view your profile and climbs</p>
          </div>
          <button
            type="button"
            onClick={() => setFormData({ ...formData, isPublic: !formData.isPublic })}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              formData.isPublic ? 'bg-gray-900 dark:bg-gray-100' : 'bg-gray-300 dark:bg-gray-600'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                formData.isPublic ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
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
          {saving ? 'Saving...' : 'Save Privacy Settings'}
        </button>
      </div>
    </form>
  )
}
