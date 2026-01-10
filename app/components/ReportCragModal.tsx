'use client'

import { useState } from 'react'

interface ReportCragModalProps {
  cragId: string
  cragName: string
  onClose: () => void
  onSubmitted?: () => void
}

const REPORT_REASONS = [
  { value: 'fake', label: 'Fake crag', description: 'This crag does not exist' },
  { value: 'duplicate', label: 'Duplicate', description: 'This crag already exists' },
  { value: 'wrong_location', label: 'Wrong location', description: 'The coordinates are incorrect' },
  { value: 'inappropriate', label: 'Inappropriate name', description: 'The name is offensive or inappropriate' },
  { value: 'not_climbing', label: 'Not a climbing area', description: 'This is not a climbing area' },
  { value: 'other', label: 'Other', description: 'Other reason' },
]

export default function ReportCragModal({ cragId, cragName, onClose, onSubmitted }: ReportCragModalProps) {
  const [reason, setReason] = useState('')
  const [details, setDetails] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!reason) {
      setError('Please select a reason')
      return
    }

    if (reason !== 'other' && details.length < 10) {
      setError('Please provide more details')
      return
    }

    setSubmitting(true)

    try {
      const response = await fetch('/api/crags/report', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          crag_id: cragId,
          reason: reason === 'other' ? details : `${REPORT_REASONS.find(r => r.value === reason)?.label}: ${details}`,
        }),
      })

      if (response.ok) {
        setSuccess(true)
        setTimeout(() => {
          onSubmitted?.()
          onClose()
        }, 2000)
      } else {
        const data = await response.json()
        setError(data.error || 'Failed to submit report')
      }
    } catch (error) {
      console.error('Error reporting crag:', error)
      setError('Failed to submit report. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (success) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
        <div 
          className="bg-white dark:bg-gray-900 rounded-lg shadow-xl w-full max-w-md mx-4 p-6"
          onClick={e => e.stopPropagation()}
        >
          <div className="text-center">
            <div className="text-4xl mb-4">✅</div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
              Report Submitted
            </h3>
            <p className="text-gray-600 dark:text-gray-400">
              Thank you for reporting. Our moderators will review this crag.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div 
        className="bg-white dark:bg-gray-900 rounded-lg shadow-xl w-full max-w-md mx-4 overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Report Crag
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Reporting: <strong>{cragName}</strong>
          </p>
        </div>

        <form onSubmit={handleSubmit} className="p-4">
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Why are you reporting this crag?
            </label>
            <div className="space-y-2">
              {REPORT_REASONS.map((r) => (
                <label
                  key={r.value}
                  className={`flex items-start gap-3 p-3 border rounded cursor-pointer transition-colors ${
                    reason === r.value
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                      : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'
                  }`}
                >
                  <input
                    type="radio"
                    name="reason"
                    value={r.value}
                    checked={reason === r.value}
                    onChange={() => setReason(r.value)}
                    className="mt-1"
                  />
                  <div>
                    <div className="font-medium text-gray-900 dark:text-gray-100">{r.label}</div>
                    <div className="text-sm text-gray-500 dark:text-gray-400">{r.description}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {reason && reason !== 'other' && (
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Additional details (optional)
              </label>
              <textarea
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                placeholder="Provide more information..."
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                rows={3}
              />
            </div>
          )}

          {reason === 'other' && (
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Please explain *
              </label>
              <textarea
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                placeholder="Describe the issue..."
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                rows={3}
                required
              />
            </div>
          )}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="flex-1 px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !reason}
              className="flex-1 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
            >
              {submitting ? 'Submitting...' : 'Submit Report'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
