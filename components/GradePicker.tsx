'use client'

import { useState, useRef, useEffect } from 'react'

const FRENCH_GRADES = [
  '5A', '5A+', '5B', '5B+', '5C', '5C+',
  '6A', '6A+', '6B', '6B+', '6C', '6C+',
  '7A', '7A+', '7B', '7B+', '7C', '7C+',
  '8A', '8A+', '8B', '8B+', '8C', '8C+',
  '9A', '9A+', '9B', '9B+', '9C', '9C+'
]

interface GradePickerProps {
  isOpen: boolean
  onClose: () => void
  onSelect: (grade: string) => void
  currentGrade?: string
  userVote?: string | null
  consensusGrade?: string
  voteCount?: number
  mode?: 'select' | 'vote'
}

export default function GradePicker({
  isOpen,
  onClose,
  onSelect,
  currentGrade,
  userVote,
  consensusGrade,
  voteCount = 0,
  mode = 'select'
}: GradePickerProps) {
  const [search, setSearch] = useState('')
  const [selectedGrade, setSelectedGrade] = useState(currentGrade || '')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus()
    }
  }, [isOpen])

  const filteredGrades = FRENCH_GRADES.filter(grade =>
    grade.toLowerCase().includes(search.toLowerCase())
  )

  const handleSelect = (grade: string) => {
    setSelectedGrade(grade)
    onSelect(grade)
    onClose()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose()
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div 
        className="bg-white dark:bg-gray-900 rounded-lg shadow-xl w-full max-w-sm mx-4 overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {mode === 'select' ? 'Select Grade' : 'Vote Grade'}
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {mode === 'select' 
              ? 'Choose a grade for this route before saving' 
              : 'Vote for the grade you think this climb is'}
          </p>
        </div>

        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <input
            ref={inputRef}
            type="text"
            placeholder="Search grades..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={handleKeyDown}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="max-h-64 overflow-y-auto">
          {filteredGrades.map(grade => {
            const isSelected = selectedGrade === grade
            const isUserVote = userVote === grade
            const isConsensus = consensusGrade === grade

            return (
              <button
                key={grade}
                onClick={() => handleSelect(grade)}
                className={`w-full px-4 py-3 text-left flex items-center justify-between hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors ${
                  isSelected ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                }`}
              >
                <span className={`font-medium ${
                  isSelected ? 'text-blue-600 dark:text-blue-400' : 'text-gray-900 dark:text-gray-100'
                }`}>
                  {grade}
                </span>
                <div className="flex items-center gap-2">
                  {isConsensus && (
                    <span className="text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-2 py-0.5 rounded">
                      Consensus
                    </span>
                  )}
                  {isUserVote && (
                    <span className="text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 px-2 py-0.5 rounded">
                      Your vote
                    </span>
                  )}
                </div>
              </button>
            )
          })}
        </div>

        {mode === 'vote' && consensusGrade && (
          <div className="p-3 bg-gray-50 dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Current consensus: <strong>{consensusGrade}</strong> with {voteCount} votes
            </p>
          </div>
        )}

        <div className="p-3 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => selectedGrade && handleSelect(selectedGrade)}
            disabled={!selectedGrade}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {mode === 'select' ? 'Save Grade' : 'Submit Vote'}
          </button>
        </div>
      </div>
    </div>
  )
}

export { FRENCH_GRADES }
