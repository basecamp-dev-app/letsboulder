'use client'

import { useState } from 'react'
import { SELECTABLE_GRADES, GradeVotingProps } from '@/lib/verification-types'
import { csrfFetch } from '@/hooks/useCsrf'
import { useGradeSystem } from '@/hooks/useGradeSystem'
import { formatGradeForDisplay } from '@/lib/grade-display'

const GRADE_COLORS: Record<string, string> = {
  '5A': 'bg-gray-100', '5A+': 'bg-gray-200', '5B': 'bg-gray-300', '5B+': 'bg-gray-400', '5C': 'bg-gray-500', '5C+': 'bg-gray-600',
  '6A': 'bg-blue-100', '6A+': 'bg-blue-200', '6B': 'bg-blue-300', '6B+': 'bg-blue-400', '6C': 'bg-blue-500', '6C+': 'bg-blue-600',
  '7A': 'bg-green-100', '7A+': 'bg-green-200', '7B': 'bg-green-300', '7B+': 'bg-green-400', '7C': 'bg-green-500', '7C+': 'bg-green-600',
  '8A': 'bg-purple-100', '8A+': 'bg-purple-200', '8B': 'bg-purple-300', '8B+': 'bg-purple-400', '8C': 'bg-purple-500', '8C+': 'bg-purple-600',
  '9A': 'bg-yellow-100', '9A+': 'bg-yellow-200', '9B': 'bg-yellow-300', '9B+': 'bg-yellow-400', '9C': 'bg-yellow-500', '9C+': 'bg-yellow-600'
}

export default function GradeVoting({ climbId, currentGrade, votes, userVote, onVote, user }: GradeVotingProps) {
  const gradeSystem = useGradeSystem()
  const [isOpen, setIsOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  const totalVotes = votes.reduce((sum, v) => sum + v.vote_count, 0)
  const maxVotes = Math.max(...votes.map(v => v.vote_count), 1)

  const handleVote = async (grade: string) => {
    if (loading) return
    setLoading(true)
    try {
      const response = await csrfFetch(`/api/climbs/${climbId}/grade-vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ grade })
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.message || 'Failed to vote')
      }
      await onVote(grade)
    } catch (error) {
      console.error('Vote error:', error)
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
          <h4 className="font-medium text-gray-900 dark:text-gray-100">Community Grade</h4>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {totalVotes} vote{totalVotes !== 1 ? 's' : ''} • Current: {formatGradeForDisplay(currentGrade, gradeSystem)}
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
          {totalVotes > 0 ? (
            <div className="space-y-2">
              {votes.map((vote) => {
                const percentage = (vote.vote_count / totalVotes) * 100
                const isUserVote = userVote === vote.grade
                return (
                  <div
                    key={vote.grade}
                    className={`flex items-center gap-2 ${isUserVote ? 'bg-blue-50 dark:bg-blue-900/20 rounded-lg p-2' : ''}`}
                  >
                    <button
                      onClick={() => handleVote(vote.grade)}
                      disabled={loading}
                      className={`flex-1 text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                        isUserVote
                          ? 'bg-blue-500 text-white'
                          : 'bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-900 dark:text-gray-100'
                      }`}
                    >
                      {formatGradeForDisplay(vote.grade, gradeSystem)}
                    </button>
                    <div className="flex-1 h-6 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className={`h-full ${GRADE_COLORS[vote.grade] || 'bg-gray-400'} transition-all duration-300`}
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                    <span className="text-xs text-gray-500 dark:text-gray-400 w-12 text-right">
                      {percentage.toFixed(0)}%
                    </span>
                    <span className="text-xs text-gray-400 dark:text-gray-500 w-8">
                      {vote.vote_count}
                    </span>
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              No community votes yet. Be the first to vote!
            </p>
          )}

          <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
            {user ? (
              <>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                  {userVote
                    ? `You voted: ${formatGradeForDisplay(userVote, gradeSystem)}`
                    : 'What grade do you think this climb is?'}
                </p>
                <div className="flex flex-wrap gap-1">
                  {SELECTABLE_GRADES.map((grade) => (
                    <button
                      key={grade}
                      onClick={() => handleVote(grade)}
                      disabled={loading}
                      className={`px-2 py-1 text-xs rounded transition-colors ${
                        userVote === grade
                          ? 'bg-blue-500 text-white'
                          : 'bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300'
                      }`}
                    >
                      {formatGradeForDisplay(grade, gradeSystem)}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Sign in to vote on the grade
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
