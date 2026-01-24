'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import { csrfFetch } from '@/hooks/useCsrf'

const FLAG_TYPES = [
  { value: 'boundary', label: 'Wrong Boundary', description: 'The crag boundary is inaccurate' },
  { value: 'access', label: 'Access Issue', description: 'Incorrect or missing access notes' },
  { value: 'description', label: 'Wrong Description', description: 'The description is incorrect' },
  { value: 'rock_type', label: 'Wrong Rock Type', description: 'The rock type is listed incorrectly' },
  { value: 'name', label: 'Wrong Name', description: 'The crag name needs to be changed' },
  { value: 'other', label: 'Other', description: 'Other issue with this crag' },
]

interface FlagCragModalProps {
  cragId: string
  cragName: string
  onClose: () => void
}

export default function FlagCragModal({ cragId, cragName, onClose }: FlagCragModalProps) {
  const [selectedType, setSelectedType] = useState('')
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)

    try {
      const response = await csrfFetch(`/api/crags/${cragId}/flag`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          flag_type: selectedType,
          comment,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        setError(data.error || 'Failed to submit flag')
        return
      }

      setSuccess(true)
      setTimeout(() => {
        onClose()
      }, 2000)
    } catch (err) {
      setError('Failed to submit flag. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (success) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-8 max-w-md w-full mx-4 text-center">
          <div className="text-4xl mb-4">✅</div>
          <h3 className="text-xl font-bold text-white mb-2">Flag Submitted</h3>
          <p className="text-gray-400">An admin will review this crag shortly.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-6 max-w-md w-full mx-4">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-white">Flag Crag</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-gray-400 mb-4">
          Flagging <span className="text-white font-medium">{cragName}</span> for admin review.
        </p>

        <form onSubmit={handleSubmit}>
          <div className="space-y-3 mb-4">
            {FLAG_TYPES.map((type) => (
              <label
                key={type.value}
                className={`flex items-start gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
                  selectedType === type.value
                    ? 'bg-red-500/20 border border-red-500'
                    : 'bg-gray-800 border border-gray-700 hover:border-gray-600'
                }`}
              >
                <input
                  type="radio"
                  name="flag_type"
                  value={type.value}
                  checked={selectedType === type.value}
                  onChange={(e) => setSelectedType(e.target.value)}
                  className="mt-1"
                />
                <div>
                  <p className="text-white font-medium">{type.label}</p>
                  <p className="text-gray-400 text-sm">{type.description}</p>
                </div>
              </label>
            ))}
          </div>

          <div className="mb-6">
            <label className="block text-sm text-gray-400 mb-2">
              Comment (minimum 10 characters)
            </label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Explain the issue..."
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-red-500 h-24 resize-none"
              minLength={10}
              required
            />
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/50 text-red-400 px-4 py-2 rounded-lg mb-4">
              {error}
            </div>
          )}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !selectedType || comment.length < 10}
              className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {submitting ? 'Submitting...' : 'Submit Flag'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
