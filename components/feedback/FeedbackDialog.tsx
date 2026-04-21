'use client'

import { useState } from 'react'
import { MessageSquare, X, Loader2, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { csrfFetch } from '@/lib/csrf-client'

interface FeedbackDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function FeedbackDialog({ open, onOpenChange }: FeedbackDialogProps) {
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async () => {
    if (!message.trim()) return

    setLoading(true)
    setError(null)

    try {
      const payload = {
        message: message.trim(),
        url: typeof window !== 'undefined' ? window.location.href : 'Unknown',
        timestamp: new Date().toISOString(),
      }

      const response = await csrfFetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!response.ok) throw new Error('Failed to send')

      setSuccess(true)
      setMessage('')
      setTimeout(() => {
        onOpenChange(false)
        setSuccess(false)
      }, 1500)
    } catch {
      setError('Failed to send feedback. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    if (!loading) {
      onOpenChange(false)
      setTimeout(() => {
        setSuccess(false)
        setError(null)
      }, 300)
    }
  }

  if (!open) return null

  return (
    <>
      <div className="fixed inset-0 z-[4000] bg-black/50" onClick={handleClose} />
      <div className="fixed left-1/2 top-1/2 z-[4001] w-full max-w-md -translate-x-1/2 -translate-y-1/2">
        <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 mx-4">
          <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              Send Feedback
            </h2>
            <button
              onClick={handleClose}
              disabled={loading}
              className="p-1 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              <X className="h-5 w-5 text-gray-500" />
            </button>
          </div>

          <div className="p-4 space-y-4">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Found a bug? Have a suggestion? Let us know!
            </p>
            <textarea
              placeholder="Describe your feedback..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="w-full min-h-[120px] p-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 resize-none focus:outline-none focus:ring-2 focus:ring-violet-500 disabled:opacity-50"
              disabled={loading}
            />
            {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          </div>

          <div className="flex justify-end gap-3 p-4 border-t border-gray-200 dark:border-gray-700">
            <Button variant="outline" onClick={handleClose} disabled={loading}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!message.trim() || loading || success}
              className="min-w-[100px]"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Sending...
                </>
              ) : success ? (
                <>
                  <Check className="h-4 w-4 mr-2" />
                  Sent!
                </>
              ) : (
                'Send Feedback'
              )}
            </Button>
          </div>
        </div>
      </div>
    </>
  )
}
