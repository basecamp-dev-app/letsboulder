'use client'

import Link from 'next/link'
import { Star } from 'lucide-react'
import { useEffect, useState } from 'react'

interface TopThisPlacePanelProps {
  slug: string
}

interface RecentSendEntry {
  user_id: string
  style: 'top' | 'flash'
  created_at: string
  profile: {
    id: string
    display_name: string
    avatar_url: string | null
  }
  climb: {
    id: string
    name: string
    grade: string
  }
  rating: number | null
}

interface RecentSendsResponse {
  recent_sends: RecentSendEntry[]
}

export default function TopThisPlacePanel({ slug }: TopThisPlacePanelProps) {
  const [entries, setEntries] = useState<RecentSendEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function loadRankings() {
      setLoading(true)
      setError(false)

      try {
        const response = await fetch(`/api/community/places/${slug}/recent-sends?limit=10`, {
          cache: 'no-store',
        })

        if (!response.ok) {
          if (!cancelled) {
            setError(true)
            setEntries([])
          }
          return
        }

        const payload = await response.json().catch(() => null as RecentSendsResponse | null)
        if (!payload || !Array.isArray(payload.recent_sends)) {
          if (!cancelled) {
            setError(true)
            setEntries([])
          }
          return
        }

        if (!cancelled) {
          setEntries(payload.recent_sends)
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
  }, [slug])

  return (
    <section className="mt-4 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
      <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Recent sends (60 days)</h2>

      {loading ? (
        <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">Loading recent sends...</p>
      ) : null}

      {!loading && error ? (
        <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">Could not load recent sends right now.</p>
      ) : null}

      {!loading && !error && entries.length === 0 ? (
        <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">No sends logged here in the last 60 days.</p>
      ) : null}

      {!loading && !error && entries.length > 0 ? (
        <div className="mt-3 space-y-2">
          {entries.map(entry => (
            <div key={`${entry.user_id}-${entry.climb.id}-${entry.created_at}`} className="flex items-center justify-between gap-3 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 dark:border-gray-700 dark:bg-gray-800/50">
              <div className="min-w-0 overflow-hidden text-sm text-gray-700 dark:text-gray-200">
                <div className="flex items-center gap-1 whitespace-nowrap">
                  <Link href={`/logbook/${entry.user_id}`} className="shrink-0 font-medium hover:underline">
                    {entry.profile.display_name}
                  </Link>
                  <span className="shrink-0 text-gray-500 dark:text-gray-400">sent</span>
                  <Link href={`/climb/${entry.climb.id}`} className="truncate font-semibold text-gray-900 hover:underline dark:text-gray-100">
                    {entry.climb.name}
                  </Link>
                  <span className="shrink-0 text-xs text-gray-500 dark:text-gray-400">{entry.climb.grade}</span>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {entry.rating !== null ? (
                  <div className="flex items-center gap-0.5" aria-label={`Climber rating ${entry.rating} out of 5`}>
                    {[1, 2, 3, 4, 5].map((value) => {
                      const active = value <= (entry.rating ?? 0)
                      return (
                        <Star
                          key={value}
                          className={`h-3.5 w-3.5 ${active ? 'fill-amber-400 text-amber-500' : 'text-gray-300 dark:text-gray-600'}`}
                        />
                      )
                    })}
                  </div>
                ) : (
                  <span className="text-xs text-gray-500 dark:text-gray-400">No rating</span>
                )}
                <span className="rounded bg-gray-200 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-gray-700 dark:bg-gray-700 dark:text-gray-200">
                  {entry.style}
                </span>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  )
}
