'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useGradeSystem } from '@/hooks/useGradeSystem'
import { formatGradeForDisplay } from '@/lib/grade-display'

type RankingSort = 'grade' | 'tops'

interface PlaceRankingEntry {
  rank: number
  user_id: string
  username: string
  avatar_url: string | null
  avg_grade: string
  climb_count: number
}

interface PlaceRankingPagination {
  page: number
  limit: number
  total_users: number
  total_pages: number
}

interface PlaceRankingsResponse {
  leaderboard: PlaceRankingEntry[]
  pagination: PlaceRankingPagination
  window?: '60d' | 'all-time'
  fallback_used?: boolean
}

interface PlaceRankingsPanelProps {
  slug: string
}

export default function PlaceRankingsPanel({ slug }: PlaceRankingsPanelProps) {
  const gradeSystem = useGradeSystem()
  const [sortBy, setSortBy] = useState<RankingSort>('tops')
  const [page, setPage] = useState(1)
  const [entries, setEntries] = useState<PlaceRankingEntry[]>([])
  const [pagination, setPagination] = useState<PlaceRankingPagination | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [windowMode, setWindowMode] = useState<'60d' | 'all-time'>('60d')
  const [fallbackUsed, setFallbackUsed] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function loadRankings() {
      setLoading(true)
      setError(false)

      try {
        const response = await fetch(`/api/community/places/${slug}/rankings?sort=${sortBy}&page=${page}&limit=20`, {
          cache: 'no-store',
        })

        if (!response.ok) {
          if (!cancelled) {
            setError(true)
            setEntries([])
            setPagination(null)
            setWindowMode('60d')
            setFallbackUsed(false)
          }
          return
        }

        const payload = await response.json().catch(() => null as PlaceRankingsResponse | null)
        if (!payload || !Array.isArray(payload.leaderboard) || !payload.pagination) {
          if (!cancelled) {
            setError(true)
            setEntries([])
            setPagination(null)
            setWindowMode('60d')
            setFallbackUsed(false)
          }
          return
        }

        if (!cancelled) {
          setEntries(payload.leaderboard)
          setPagination(payload.pagination)
          setWindowMode(payload.window === 'all-time' ? 'all-time' : '60d')
          setFallbackUsed(Boolean(payload.fallback_used))
        }
      } catch {
        if (!cancelled) {
          setError(true)
          setEntries([])
          setPagination(null)
          setWindowMode('60d')
          setFallbackUsed(false)
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void loadRankings()

    return () => {
      cancelled = true
    }
  }, [page, slug, sortBy])

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Place rankings ({windowMode === 'all-time' ? 'all time' : '60 days'})</h2>
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

      {loading ? (
        <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">Loading rankings...</p>
      ) : null}

      {!loading && error ? (
        <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">Could not load rankings right now.</p>
      ) : null}

      {!loading && !error && entries.length === 0 ? (
        <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">No public rankings for this place yet.</p>
      ) : null}

      {!loading && !error && fallbackUsed ? (
        <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">No public rankings in the last 60 days, showing all-time results.</p>
      ) : null}

      {!loading && !error && entries.length > 0 ? (
        <div className="mt-3 divide-y divide-gray-100 rounded-lg border border-gray-200 dark:divide-gray-800 dark:border-gray-700">
          {entries.map(entry => (
            <Link
              key={entry.user_id}
              href={`/logbook/${entry.user_id}`}
              className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-800/60"
            >
              <span className="w-7 shrink-0 text-sm font-semibold text-gray-600 dark:text-gray-300">#{entry.rank}</span>
              {entry.avatar_url ? (
                <img src={entry.avatar_url} alt={entry.username} className="h-8 w-8 rounded-full object-cover" />
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
