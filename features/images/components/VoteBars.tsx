'use client'

import { useMemo } from 'react'
import { sortVotesByGradeOrder } from '@/features/images/lib/route-detail-utils'
import { formatGradeForDisplay } from '@/lib/grade-display'
import type { GradeSystem } from '@/lib/grades'
import type { GradeVoteDistribution } from '@/lib/verification-types'

function VoteBars({ votes, userVote, gradeSystem }: { votes: GradeVoteDistribution[]; userVote: string | null; gradeSystem: GradeSystem }) {
  const sortedVotes = useMemo(() => sortVotesByGradeOrder(votes), [votes])
  const totalVotes = useMemo(() => sortedVotes.reduce((sum, v) => sum + v.vote_count, 0), [sortedVotes])
  const maxVotes = useMemo(() => Math.max(1, ...sortedVotes.map((v) => v.vote_count)), [sortedVotes])

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950/40 p-4">
      <div className="flex items-baseline justify-between">
        <p className="text-sm font-medium text-gray-900 dark:text-gray-200">Grade votes</p>
        <p className="text-xs text-gray-600 dark:text-gray-400 tabular-nums">{totalVotes} total</p>
      </div>

      {sortedVotes.length === 0 ? (
        <div className="mt-4">
          <div className="h-2 rounded-full bg-gray-200 dark:bg-gray-800" />
          <p className="text-xs text-gray-600 dark:text-gray-400 mt-3">No votes yet</p>
        </div>
      ) : (
        <div className="mt-4 space-y-2">
          {sortedVotes.map((v) => {
            const pct = Math.round((v.vote_count / maxVotes) * 100)
            const isUser = !!userVote && userVote === v.grade
            return (
              <div
                key={v.grade}
                className={`grid grid-cols-[52px_1fr_auto] items-center gap-3 rounded-lg px-2 py-1 ${
                  isUser ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                }`}
              >
                <span className={`text-xs font-medium tabular-nums ${isUser ? 'text-blue-700 dark:text-blue-200' : 'text-gray-900 dark:text-gray-200'}`}>
                  {formatGradeForDisplay(v.grade, gradeSystem)}
                </span>
                <div className="h-2 rounded-full bg-gray-200 dark:bg-gray-800 overflow-hidden relative">
                  <div
                    className={`h-full rounded-full ${isUser ? 'bg-blue-600' : 'bg-blue-500/80'}`}
                    style={{ width: `${pct}%` }}
                  />
                  {pct > 0 && (
                    <div
                      className={`absolute top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full ${isUser ? 'bg-blue-700' : 'bg-blue-600/80'}`}
                      style={{ left: `calc(${pct}% - 3px)` }}
                    />
                  )}
                </div>
                <span
                  className={`text-xs tabular-nums rounded-md px-2 py-0.5 border ${
                    isUser
                      ? 'border-blue-200 text-blue-800 bg-blue-50 dark:border-blue-800 dark:text-blue-200 dark:bg-blue-900/20'
                      : 'border-gray-200 text-gray-700 bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:bg-gray-800/40'
                  }`}
                >
                  {v.vote_count}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default VoteBars
