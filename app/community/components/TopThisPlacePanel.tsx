'use client'

import { useEffect, useState } from 'react'

interface TopThisPlacePanelProps {
  slug: string
}

interface RankingEntry {
  rank: number
  user_id: string
  username: string
  avatar_url: string | null
  avg_grade: string
  climb_count: number
}

interface RankingsResponse {
  leaderboard: RankingEntry[]
}

type RankingSort = 'tops' | 'grade'

export default function TopThisPlacePanel({ slug }: TopThisPlacePanelProps) {
  const [entries, setEntries] = useState<RankingEntry[]>([])
  const [sort, setSort] = useState<RankingSort>('tops')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function loadRankings() {
      setLoading(true)
      setError(false)

      try {
        const response = await fetch(`/api/community/places/${slug}/rankings?sort=${sort}&limit=5`, {
          cache: 'no-store',
        })

        if (!response.ok) {
          if (!cancelled) {
            setError(true)
            setEntries([])
          }
          return
        }

        const payload = await response.json().catch(() => null as RankingsResponse | null)
        if (!payload || !Array.isArray(payload.leaderboard)) {
          if (!cancelled) {
            setError(true)
            setEntries([])
          }
          return
        }

        if (!cancelled) {
          setEntries(payload.leaderboard)
        }
      } catch {
        if (!cancelled) {
          setError(true)
          setEntries([])
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
  }, [slug, sort])

  const sortLabel = sort === 'tops' ? 'by tops' : 'by grade'
  const emptyLabel = sort === 'tops'
    ? 'No tops logged here in the last 60 days.'
    : 'No qualifying climbs for grade rankings in the last 60 days.'

  return (
    <section className="mt-4 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Top this place (60 days)</h2>
        <span className="text-xs text-gray-500 dark:text-gray-400">{sortLabel}</span>
      </div>

      <div className="mt-3 inline-flex rounded-md border border-gray-300 p-0.5 dark:border-gray-700">
        <button
          type="button"
          onClick={() => setSort('tops')}
          className={`rounded px-2.5 py-1 text-xs font-medium transition ${sort === 'tops'
            ? 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900'
            : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800'}`}
        >
          Tops
        </button>
        <button
          type="button"
          onClick={() => setSort('grade')}
          className={`rounded px-2.5 py-1 text-xs font-medium transition ${sort === 'grade'
            ? 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900'
            : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800'}`}
        >
          Grade
        </button>
      </div>

      {loading ? (
        <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">Loading rankings...</p>
      ) : null}

      {!loading && error ? (
        <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">Could not load rankings right now.</p>
      ) : null}

      {!loading && !error && entries.length === 0 ? (
        <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">{emptyLabel}</p>
      ) : null}

      {!loading && !error && entries.length > 0 ? (
        <div className="mt-3 space-y-2">
          {entries.map(entry => (
            <div key={entry.user_id} className="flex items-center justify-between gap-3 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 dark:border-gray-700 dark:bg-gray-800/50">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                  #{entry.rank} {entry.username}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Avg {entry.avg_grade}</p>
              </div>
              <p className="text-xs font-semibold text-gray-700 dark:text-gray-200">{entry.climb_count} tops</p>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  )
}
