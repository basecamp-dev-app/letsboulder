'use client'

import { useState, useRef, useEffect, useMemo } from 'react'
import { getGradeSystemForClimbType, useGradePreferences } from '@/features/grades/hooks/useGradeSystem'
import { formatGradeForDisplay, toWholeVGrade } from '@/lib/grade-display'
import { PUBLIC_GRADES, type GradeSystem } from '@/lib/grades'
import type { ClimbType } from '@/types/climbing'

const FRENCH_GRADES = PUBLIC_GRADES

interface GradePickerProps {
  isOpen: boolean
  onClose: () => void
  onSelect: (grade: string) => void
  currentGrade?: string
  climbType?: ClimbType | 'deep_water_solo'
  gradeSystem?: GradeSystem
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
  climbType,
  gradeSystem: gradeSystemProp,
  userVote,
  consensusGrade,
  voteCount = 0,
  mode = 'select'
}: GradePickerProps) {
  const gradePreferences = useGradePreferences()
  const [search, setSearch] = useState('')
  const [pendingGrade, setPendingGrade] = useState(currentGrade || '')
  const [pickerSession, setPickerSession] = useState({ isOpen, currentGrade })
  const inputRef = useRef<HTMLInputElement>(null)
  const openedAtRef = useRef<number>(0)

  if (pickerSession.isOpen !== isOpen || (isOpen && pickerSession.currentGrade !== currentGrade)) {
    setPickerSession({ isOpen, currentGrade })
    if (isOpen) {
      setPendingGrade(currentGrade || '')
      setSearch('')
    }
  }

  const gradeSystem = useMemo(() => {
    if (gradeSystemProp) return gradeSystemProp
    return getGradeSystemForClimbType(climbType, gradePreferences)
  }, [climbType, gradePreferences, gradeSystemProp])

  const gradeOptions = useMemo(() => {
    if (gradeSystem !== 'v_scale') {
      return FRENCH_GRADES.map((grade) => ({
        grade,
        label: formatGradeForDisplay(grade, gradeSystem),
      }))
    }

    const byWholeV = new Map<string, string>()
    for (const grade of FRENCH_GRADES) {
      const wholeV = toWholeVGrade(grade)
      if (!wholeV) continue
      if (!byWholeV.has(wholeV)) {
        byWholeV.set(wholeV, grade)
      }
    }

    return Array.from(byWholeV.entries()).map(([label, grade]) => ({ grade, label }))
  }, [gradeSystem])

  const selectedWholeV = useMemo(() => {
    if (gradeSystem !== 'v_scale') return null
    return toWholeVGrade(pendingGrade)
  }, [gradeSystem, pendingGrade])

  const userVoteWholeV = useMemo(() => {
    if (gradeSystem !== 'v_scale') return null
    return toWholeVGrade(userVote || null)
  }, [gradeSystem, userVote])

  const consensusWholeV = useMemo(() => {
    if (gradeSystem !== 'v_scale') return null
    return toWholeVGrade(consensusGrade || null)
  }, [consensusGrade, gradeSystem])

  const getDisplayLabel = (grade: string | null | undefined): string => {
    if (gradeSystem === 'v_scale') {
      return toWholeVGrade(grade) || formatGradeForDisplay(grade, gradeSystem)
    }
    return formatGradeForDisplay(grade, gradeSystem)
  }

  useEffect(() => {
    if (!isOpen) return

    openedAtRef.current = Date.now()
    inputRef.current?.focus()
  }, [isOpen])

  const handleBackdropClose = () => {
    if (Date.now() - openedAtRef.current < 150) return
    onClose()
  }

  const filteredGrades = gradeOptions.filter((option) => {
    const query = search.toLowerCase().trim()
    if (!query) return true
    return option.grade.toLowerCase().includes(query) || option.label.toLowerCase().includes(query)
  })

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose()
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[6000] flex items-center justify-center bg-black/50 p-2 sm:p-4" onClick={handleBackdropClose}>
      <div
        className="flex max-h-[calc(100dvh-1rem)] w-full max-w-sm flex-col overflow-hidden rounded-2xl bg-white shadow-xl dark:bg-gray-900 sm:max-h-[calc(100dvh-2rem)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-gray-200 p-4 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {mode === 'select' ? 'Select Grade' : 'Vote Grade'}
          </h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {mode === 'select' 
              ? 'Choose a grade, then tap Save Grade.' 
              : 'Vote for the grade you think this climb is'}
          </p>
        </div>

        <div className="border-b border-gray-200 p-4 dark:border-gray-700">
          <input
            ref={inputRef}
            type="text"
            placeholder="Search grades..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={handleKeyDown}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
          />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {filteredGrades.map((option) => {
            const isSelected = gradeSystem === 'v_scale'
              ? selectedWholeV === option.label
              : pendingGrade === option.grade
            const isUserVote = gradeSystem === 'v_scale'
              ? userVoteWholeV === option.label
              : userVote === option.grade
            const isConsensus = gradeSystem === 'v_scale'
              ? consensusWholeV === option.label
              : consensusGrade === option.grade

            return (
              <button
                key={option.grade}
                onClick={() => setPendingGrade(option.grade)}
                className={`flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-gray-100 dark:hover:bg-gray-800 ${
                  isSelected ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                }`}
              >
                <span className={`font-medium ${
                  isSelected ? 'text-blue-600 dark:text-blue-400' : 'text-gray-900 dark:text-gray-100'
                }`}>
                  {option.label}
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
          <div className="border-t border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Current consensus: <strong>{getDisplayLabel(consensusGrade)}</strong> with {voteCount} votes
            </p>
          </div>
        )}

        <div className="shrink-0 border-t border-gray-200 bg-white/95 p-3 backdrop-blur dark:border-gray-700 dark:bg-gray-900/95">
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <button
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-gray-700 transition-colors hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                if (!pendingGrade) return
                onSelect(pendingGrade)
                onClose()
              }}
              disabled={!pendingGrade}
              className="rounded-lg bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {mode === 'select' ? 'Save Grade' : 'Submit Vote'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export { FRENCH_GRADES }
