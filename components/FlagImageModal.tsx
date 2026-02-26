'use client'

import { useState } from 'react'
import { csrfFetch } from '@/hooks/useCsrf'
import { useOverlayHistory } from '@/hooks/useOverlayHistory'

const FLAG_TYPES = [
  { value: 'location', label: 'Location', description: 'Wrong GPS coordinates' },
  { value: 'route_line', label: 'Route Line', description: 'Incorrect route drawing' },
  { value: 'route_name', label: 'Route Name', description: 'Wrong or duplicate name' },
  { value: 'image_quality', label: 'Image Quality', description: 'Poor or unclear photo' },
  { value: 'wrong_crag', label: 'Wrong Crag', description: 'Image at wrong location' },
  { value: 'other', label: 'Other', description: 'Other issue' },
]

const MAX_COMMENT_LENGTH = 250

interface FlagImageModalProps {
  imageId: string
  imageUrl?: string
  onClose: () => void
  onSubmitted?: () => void
}

export default function FlagImageModal({ imageId, onClose, onSubmitted }: FlagImageModalProps) {
  useOverlayHistory({ open: true, onClose, id: `flag-image-${imageId}` })

  const [step, setStep] = useState<'select' | 'comment'>('select')
  const [flagType, setFlagType] = useState('')
  const [selectedType, setSelectedType] = useState<typeof FLAG_TYPES[0] | null>(null)
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const handleTypeSelect = (type: typeof FLAG_TYPES[0]) => {
    setSelectedType(type)
    setFlagType(type.value)
    setStep('comment')
  }

  const handleBack = () => {
    setStep('select')
    setSelectedType(null)
    setError('')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    const trimmedComment = comment.trim()
    if (trimmedComment.length < 10) {
      setError('Please provide at least 10 characters of detail')
      return
    }

    if (trimmedComment.length > MAX_COMMENT_LENGTH) {
      setError(`Comment must be ${MAX_COMMENT_LENGTH} characters or less`)
      return
    }

    setSubmitting(true)

    try {
      const response = await csrfFetch(`/api/images/${imageId}/flag`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          flag_type: flagType,
          comment: trimmedComment,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        setError(data.error || 'Failed to submit flag')
        return
      }

      setSuccess(true)
      setTimeout(() => {
        onSubmitted?.()
        onClose()
      }, 2000)
    } catch (error) {
      console.error('Error flagging image:', error)
      setError('Failed to submit flag. Please try again.')
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
            <div className="text-4xl mb-4">🚩</div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
              Flag Submitted
            </h3>
            <p className="text-gray-600 dark:text-gray-400">
              Thank you. An admin will review this image.
            </p>
          </div>
        </div>
      </div>
    )
  }

  if (step === 'comment' && selectedType) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
        <div
          className="bg-white dark:bg-gray-900 rounded-lg shadow-xl w-full max-w-md mx-4 overflow-hidden"
          onClick={e => e.stopPropagation()}
        >
          <div className="p-4 border-b border-gray-200 dark:border-gray-700">
            <button
              onClick={handleBack}
              className="flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 mb-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back
            </button>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {selectedType.label}
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {selectedType.description}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="p-4">
            {error && (
              <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-sm text-red-700 dark:text-red-400">
                {error}
              </div>
            )}

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Describe the issue *
              </label>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Please provide details about the issue..."
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 resize-none"
                rows={4}
                maxLength={MAX_COMMENT_LENGTH}
                autoFocus
              />
              <div className="text-right text-xs text-gray-500 dark:text-gray-400 mt-1">
                {comment.length}/{MAX_COMMENT_LENGTH} characters (minimum 10)
              </div>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleBack}
                disabled={submitting}
                className="flex-1 px-4 py-2 bg-gray-300 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-400 dark:hover:bg-gray-600 disabled:opacity-50"
              >
                Back
              </button>
              <button
                type="submit"
                disabled={submitting || comment.trim().length < 10}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? 'Submitting...' : 'Submit Flag'}
              </button>
            </div>
          </form>
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
            Report Image
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            What is wrong with this image?
          </p>
        </div>

        <div className="p-4">
          <div className="space-y-2">
            {FLAG_TYPES.map((type) => (
              <button
                key={type.value}
                onClick={() => handleTypeSelect(type)}
                className={`w-full flex items-start gap-3 p-3 border rounded cursor-pointer transition-colors text-left ${
                  flagType === type.value
                    ? 'border-red-500 bg-red-50 dark:bg-red-900/20'
                    : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'
                }`}
              >
                <div className="mt-1">
                  <div className="w-4 h-4 rounded-full border-2 border-gray-300 dark:border-gray-600" />
                </div>
                <div>
                  <div className="font-medium text-gray-900 dark:text-gray-100">{type.label}</div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">{type.description}</div>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="p-4 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={onClose}
            className="w-full px-4 py-2 bg-gray-300 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-400 dark:hover:bg-gray-600"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
