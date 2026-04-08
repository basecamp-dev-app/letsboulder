'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useGradeSystem } from '@/lib/grades/preferences'
import { formatGradeForDisplay } from '@/lib/grade-display'
import { communityKeys, fetchCragRankings, fetchRankings } from '@/features/community/lib/queries'

type RankingSort = 'grade' | 'tops'

interface PlaceRankingsPanelProps {
  slug?: string
  cragId?: string
  placeType: 'crag' | 'gym'
  embedded?: boolean
}

export default function PlaceRankingsPanel({ slug, cragId, placeType, embedded = false }: PlaceRankingsPanelProps) {
  const gradeSystem = useGradeSystem()
  const [sortBy, setSortBy] = useState<RankingSort>('tops')
  const [page, setPage] = useState(1)
  const rankingScope = placeType === 'crag' ? `crag:${cragId || 'missing'}` : `place:${slug || 'missing'}`

  const { data, isLoading, isError } = useQuery({
    queryKey: communityKeys.rankings(rankingScope, sortBy, page),
    queryFn: () => {
      if (placeType === 'crag') {
        if (!cragId) {
          throw new Error('Missing crag id for rankings')
        }

        return fetchCragRankings(cragId, sortBy, page, 20)
      }

      if (!slug) {
        throw new Error('Missing place slug for rankings')
      }

      return fetchRankings(slug, sortBy, page, 20)
    },
    meta: { persist: true },
  })

  const entries = data?.leaderboard ?? []
  const pagination = data?.pagination ?? null
  const windowMode = data?.window ?? '60d'
  const fallbackUsed = data?.fallback_used ?? false
  const placeLabel = placeType === 'gym' ? 'Gym' : 'Crag'

  return (
    <section className={embedded ? '' : 'rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900'}>
      <div className="flex items-center justify-between gap-3">
        {!embedded ? <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{placeLabel} rankings ({windowMode === 'all-time' ? 'all time' : '60 days'})</h2> : <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{placeLabel} rankings{windowMode === 'all-time' ? ' (all time)' : ''}</p>}
        <div className="flex rounded-lg bg-gray-100 p-0.5 dark:bg-gray-800">
          <button
            type="button"
            onClick={() => {
              setSortBy('tops')
              setPage(1)
            }}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
              sortBy === 'tops'
                ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-gray-100'
                : 'text-gray-600 dark:text-gray-400'
            }`}
          >
            Tops
          </button>
          <button
            type="button"
            onClick={() => {
              setSortBy('grade')
              setPage(1)
            }}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
              sortBy === 'grade'
                ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-gray-100'
                : 'text-gray-600 dark:text-gray-400'
            }`}
          >
            Grade
          </button>
        </div>
      </div>

      {isLoading ? (
        <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">Loading rankings...</p>
      ) : null}

      {!isLoading && isError ? (
        <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">Could not load rankings right now.</p>
      ) : null}

      {!isLoading && !isError && entries.length === 0 ? (
        <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">No public rankings for this {placeType} yet.</p>
      ) : null}

      {!isLoading && !isError && fallbackUsed ? (
        <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">No public rankings in the last 60 days, showing all-time results.</p>
      ) : null}

      {!isLoading && !isError && entries.length > 0 ? (
        <div className="mt-3 divide-y divide-gray-100 rounded-lg border border-gray-200 dark:divide-gray-800 dark:border-gray-700">
          {entries.map(entry => (
            <Link
              key={entry.user_id}
              href={`/logbook/${entry.user_id}`}
              className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-800/60"
            >
              <span className="w-7 shrink-0 text-sm font-semibold text-gray-600 dark:text-gray-300">#{entry.rank}</span>
                {entry.avatar_url ? (
                  <Image src={entry.avatar_url} alt={entry.username} width={32} height={32} sizes="32px" className="h-8 w-8 rounded-full object-cover" />
                ) : (
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-200 text-xs font-medium text-gray-600 dark:bg-gray-700 dark:text-gray-200">
                  {entry.username.slice(0, 2).toUpperCase()}
                </div>
              )}
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-gray-900 dark:text-gray-100">{entry.username}</span>
              {sortBy === 'tops' ? (
                <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800 dark:bg-green-900/30 dark:text-green-200">
                  {entry.climb_count} tops
                </span>
              ) : (
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-800 dark:bg-gray-700 dark:text-gray-200">
                  {formatGradeForDisplay(entry.avg_grade, gradeSystem)}
                </span>
              )}
            </Link>
          ))}
        </div>
      ) : null}

      {pagination && pagination.total_pages > 1 ? (
        <div className="mt-3 flex items-center justify-between">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {pagination.page}/{pagination.total_pages}
          </p>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => setPage(current => Math.max(1, current - 1))}
              disabled={page === 1}
              className="rounded-md border border-gray-300 px-3 py-1 text-xs text-gray-700 hover:bg-gray-100 disabled:opacity-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              Prev
            </button>
            <button
              type="button"
              onClick={() => setPage(current => Math.min(pagination.total_pages, current + 1))}
              disabled={page === pagination.total_pages}
              className="rounded-md border border-gray-300 px-3 py-1 text-xs text-gray-700 hover:bg-gray-100 disabled:opacity-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              Next
            </button>
          </div>
        </div>
      ) : null}
    </section>
  )
}
