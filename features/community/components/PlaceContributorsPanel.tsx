'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { communityKeys, fetchCragContributors, fetchPlaceContributors } from '@/features/community/lib/queries'

interface PlaceContributorsPanelProps {
  slug?: string
  cragId?: string
  placeType: 'crag' | 'gym'
  embedded?: boolean
  previewLimit?: number
  expanded?: boolean
  onToggleExpanded?: () => void
}

export default function PlaceContributorsPanel({
  slug,
  cragId,
  placeType,
  embedded = false,
  previewLimit = 3,
  expanded = true,
  onToggleExpanded,
}: PlaceContributorsPanelProps) {
  const contributorScope = placeType === 'crag' ? `crag-contributors:${cragId || 'missing'}` : `place-contributors:${slug || 'missing'}`

  const { data, isLoading, isError } = useQuery({
    queryKey: communityKeys.contributors(contributorScope, 1),
    queryFn: () => {
      if (placeType === 'crag') {
        if (!cragId) throw new Error('Missing crag id for contributor leaderboard')
        return fetchCragContributors(cragId, 1, 20)
      }

      if (!slug) throw new Error('Missing place slug for contributor leaderboard')
      return fetchPlaceContributors(slug, 1, 20)
    },
  })

  const entries = data?.leaderboard ?? []
  const visibleEntries = embedded && !expanded ? entries.slice(0, previewLimit) : entries
  const canExpand = embedded && entries.length > previewLimit

  return (
    <section className={embedded ? '' : 'mt-4 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900'}>
      {!embedded ? <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Top contributors</h2> : <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Top contributors</p>}

      {isLoading ? <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">Loading contributors...</p> : null}
      {!isLoading && isError ? <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">Could not load contributors right now.</p> : null}
      {!isLoading && !isError && entries.length === 0 ? <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">No contributor score activity here yet.</p> : null}

      {!isLoading && !isError && entries.length > 0 ? (
        <div className="mt-3 divide-y divide-gray-100 rounded-lg border border-gray-200 dark:divide-gray-800 dark:border-gray-700">
          {visibleEntries.map((entry) => (
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
              <div className="flex shrink-0 items-center gap-2">
                <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-200">
                  {entry.contributor_score_total} score
                </span>
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-800 dark:bg-gray-700 dark:text-gray-200">
                  {entry.accepted_contribution_count} accepted
                </span>
              </div>
            </Link>
          ))}
        </div>
      ) : null}

      {canExpand ? (
        <button
          type="button"
          onClick={onToggleExpanded}
          className="mt-3 text-sm font-medium text-stone-700 transition hover:text-stone-900 dark:text-gray-300 dark:hover:text-gray-100"
        >
          {expanded ? 'Show fewer contributors' : `Show full contributor board (${entries.length})`}
        </button>
      ) : null}
    </section>
  )
}
