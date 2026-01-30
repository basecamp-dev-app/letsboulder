'use client'

import { useState } from 'react'
import { CorrectionSectionProps, CorrectionType, VALID_GRADES } from '@/lib/verification-types'
import { csrfFetch } from '@/hooks/useCsrf'

const CORRECTION_TYPE_LABELS: Record<CorrectionType, string> = {
  location: 'Location',
  name: 'Name',
  line: 'Route Line',
  grade: 'Grade'
}

const CORRECTION_TYPE_ICONS: Record<CorrectionType, string> = {
  location: '📍',
  name: '📝',
  line: '📐',
  grade: '🎯'
}

export default function CorrectionSection({
  climbId,
  corrections,
  onSubmitCorrection,
  onVoteCorrection
}: CorrectionSectionProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [correctionType, setCorrectionType] = useState<CorrectionType>('name')
  const [suggestedName, setSuggestedName] = useState('')
  const [suggestedGrade, setSuggestedGrade] = useState('6A')
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(false)

  const pendingCorrections = corrections.filter(c => c.status === 'pending')
  const approvedCorrections = corrections.filter(c => c.status === 'approved')
  const rejectedCorrections = corrections.filter(c => c.status === 'rejected')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (loading) return

    setLoading(true)
    try {
      const suggestedValue: Record<string, unknown> = {}
      
      switch (correctionType) {
        case 'name':
          suggestedValue.name = suggestedName
          break
        case 'grade':
          suggestedValue.grade = suggestedGrade
          break
        case 'location':
          suggestedValue.latitude = 0
          suggestedValue.longitude = 0
          break
        case 'line':
          suggestedValue.points = []
          break
      }

      const response = await csrfFetch(`/api/climbs/${climbId}/correction`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          correction_type: correctionType,
          suggested_value: suggestedValue,
          reason: reason || undefined
        })
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.message || 'Failed to submit correction')
      }

      await onSubmitCorrection({
        correction_type: correctionType,
        suggested_value: suggestedValue,
        reason: reason || undefined
      })

      setShowForm(false)
      setSuggestedName('')
      setSuggestedGrade('6A')
      setReason('')
    } catch (error) {
      console.error('Correction error:', error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="border-t border-gray-200 dark:border-gray-700 pt-4 mt-4">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between w-full text-left"
      >
        <div>
          <h4 className="font-medium text-gray-900 dark:text-gray-100">Corrections</h4>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {corrections.length} correction{corrections.length !== 1 ? 's' : ''} submitted
            {pendingCorrections.length > 0 && ` • ${pendingCorrections.length} pending`}
          </p>
        </div>
        <svg
          className={`w-5 h-5 transform transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="mt-4 space-y-4">
          {/* Submit correction button/form */}
          {!showForm ? (
            <button
              onClick={() => setShowForm(true)}
              className="w-full py-2 px-4 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 transition-colors"
            >
              + Submit Correction
            </button>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-3 bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Correction Type
                </label>
                <select
                  value={correctionType}
                  onChange={(e) => setCorrectionType(e.target.value as CorrectionType)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                >
                  {Object.entries(CORRECTION_TYPE_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {CORRECTION_TYPE_ICONS[value as CorrectionType]} {label}
                    </option>
                  ))}
                </select>
              </div>

              {correctionType === 'name' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Suggested Name
                  </label>
                  <input
                    type="text"
                    value={suggestedName}
                    onChange={(e) => setSuggestedName(e.target.value)}
                    placeholder="Enter correct name"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    required
                  />
                </div>
              )}

              {correctionType === 'grade' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Suggested Grade
                  </label>
                  <select
                    value={suggestedGrade}
                    onChange={(e) => setSuggestedGrade(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  >
                    {VALID_GRADES.map((grade) => (
                      <option key={grade} value={grade}>{grade}</option>
                    ))}
                  </select>
                </div>
              )}

              {correctionType === 'location' && (
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  To correct the location, please upload a new photo with GPS coordinates.
                </p>
              )}

              {correctionType === 'line' && (
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  To correct the route line, please upload a new photo with the corrected line.
                </p>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Reason (optional)
                </label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Why should this be corrected?"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  rows={2}
                />
              </div>

              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={loading || (correctionType === 'name' && !suggestedName)}
                  className="flex-1 py-2 px-4 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {loading ? 'Submitting...' : 'Submit'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="py-2 px-4 bg-gray-300 dark:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-400 dark:hover:bg-gray-500 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          {/* Pending corrections */}
          {pendingCorrections.length > 0 && (
            <div className="space-y-2">
              <h5 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Pending ({pendingCorrections.length})
              </h5>
              {pendingCorrections.map((correction) => (
                <CorrectionCard
                  key={correction.id}
                  correction={correction}
                  onVote={onVoteCorrection}
                  canVote={true}
                />
              ))}
            </div>
          )}

          {/* Approved corrections */}
          {approvedCorrections.length > 0 && (
            <div className="space-y-2">
              <h5 className="text-sm font-medium text-green-700 dark:text-green-400">
                Approved ({approvedCorrections.length})
              </h5>
              {approvedCorrections.map((correction) => (
                <CorrectionCard
                  key={correction.id}
                  correction={correction}
                  onVote={onVoteCorrection}
                  canVote={false}
                />
              ))}
            </div>
          )}

          {/* Rejected corrections */}
          {rejectedCorrections.length > 0 && (
            <div className="space-y-2">
              <h5 className="text-sm font-medium text-red-700 dark:text-red-400">
                Rejected ({rejectedCorrections.length})
              </h5>
              {rejectedCorrections.map((correction) => (
                <CorrectionCard
                  key={correction.id}
                  correction={correction}
                  onVote={onVoteCorrection}
                  canVote={false}
                />
              ))}
            </div>
          )}

          {corrections.length === 0 && (
            <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
              No corrections submitted yet
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function CorrectionCard({
  correction,
  onVote,
  canVote
}: {
  correction: CorrectionSectionProps['corrections'][0]
  onVote: (correctionId: string, voteType: 'approve' | 'reject') => void
  canVote: boolean
}) {
  const [loading, setLoading] = useState(false)

  const handleVote = async (voteType: 'approve' | 'reject') => {
    if (loading || !canVote) return
    setLoading(true)
    try {
      const response = await csrfFetch(`/api/corrections/${correction.id}/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vote_type: voteType })
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.message || 'Failed to vote')
      }

      await onVote(correction.id, voteType)
    } catch (error) {
      console.error('Vote error:', error)
    } finally {
      setLoading(false)
    }
  }

  const getStatusColor = () => {
    switch (correction.status) {
      case 'approved': return 'border-green-300 bg-green-50 dark:bg-green-900/20'
      case 'rejected': return 'border-red-300 bg-red-50 dark:bg-red-900/20'
      default: return 'border-yellow-300 bg-yellow-50 dark:bg-yellow-900/20'
    }
  }

  const getStatusBadge = () => {
    switch (correction.status) {
      case 'approved': return { text: '✓ Approved', color: 'bg-green-100 text-green-800' }
      case 'rejected': return { text: '✗ Rejected', color: 'bg-red-100 text-red-800' }
      default: return { text: `${correction.approval_count}/3 approved`, color: 'bg-yellow-100 text-yellow-800' }
    }
  }

  const badge = getStatusBadge()

  return (
    <div className={`p-3 rounded-lg border ${getStatusColor()}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span>{CORRECTION_TYPE_ICONS[correction.correction_type as CorrectionType]}</span>
            <span className="font-medium text-gray-900 dark:text-gray-100">
              {CORRECTION_TYPE_LABELS[correction.correction_type as CorrectionType]}
            </span>
            <span className={`text-xs px-2 py-0.5 rounded ${badge.color}`}>
              {badge.text}
            </span>
          </div>
          {correction.reason && (
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
              &quot;{correction.reason}&quot;
            </p>
          )}
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {correction.status === 'pending' && `${correction.approval_count} approvals, ${correction.rejection_count} rejections`}
            {correction.status === 'approved' && `Applied: ${new Date(correction.resolved_at || '').toLocaleDateString()}`}
            {correction.status === 'rejected' && `Rejected: ${new Date(correction.resolved_at || '').toLocaleDateString()}`}
          </p>
        </div>
        {canVote && correction.status === 'pending' && (
          <div className="flex gap-1">
            <button
              onClick={() => handleVote('approve')}
              disabled={loading}
              className="p-1.5 bg-green-100 hover:bg-green-200 dark:bg-green-900/40 dark:hover:bg-green-900/60 text-green-700 dark:text-green-400 rounded transition-colors"
              title="Approve"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </button>
            <button
              onClick={() => handleVote('reject')}
              disabled={loading}
              className="p-1.5 bg-red-100 hover:bg-red-200 dark:bg-red-900/40 dark:hover:bg-red-900/60 text-red-700 dark:text-red-400 rounded transition-colors"
              title="Reject"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
