'use client'

import Link from 'next/link'
import { Star } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { communityKeys, fetchRecentSends, type RecentSendEntry } from '@/features/community/lib/queries'

interface TopThisPlacePanelProps {
  slug: string
}

export default function TopThisPlacePanel({ slug }: TopThisPlacePanelProps) {
  const { data, isLoading, isError } = useQuery({
    queryKey: communityKeys.recentSends(slug),
    queryFn: () => fetchRecentSends(slug, 10),
    meta: { persist: true },
  })

  const entries: RecentSendEntry[] = data?.recent_sends ?? []

  return (
    <section className="mt-4 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
      <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Recent sends (60 days)</h2>

      {isLoading ? (
        <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">Loading recent sends...</p>
      ) : null}

      {!isLoading && isError ? (
        <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">Could not load recent sends right now.</p>
      ) : null}

      {!isLoading && !isError && entries.length === 0 ? (
        <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">No sends logged here in the last 60 days.</p>
      ) : null}

      {!isLoading && !isError && entries.length > 0 ? (
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
