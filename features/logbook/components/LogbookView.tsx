'use client'

import { useEffect, useMemo } from 'react'
import dynamic from 'next/dynamic'
import Image from 'next/image'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useGradeSystem } from '@/lib/grades/preferences'
import { EmptyLogbook, LogbookSkeleton, LogEntrySkeleton } from '@/features/logbook/components/LogbookStates'
import { LogbookStatsSection } from '@/features/logbook/components/LogbookStatsSection'
import {
  getLogbookLowestGrade,
  getOwnerSubmissionCounts,
  getLogbookStats,
  getRecentLogbookLogs,
  type OwnerSubmissionCounts,
  type LogbookClimb,
  type LogbookLifetimeStats,
  type LogbookProfile,
  type ProgressLogEntry,
} from '@/features/logbook/lib/logbook-view'
import type { Submission } from '@/types/submissions'
import type { SavedClimb, SavedCrag } from '@/features/saved/public-client'
import { LogbookSavedSection } from '@/features/logbook/components/LogbookSavedSection'

const DeferredLogbookSubmissions = dynamic(() => import('@/features/logbook/components/DeferredLogbookSubmissions'), {
  ssr: false,
})

interface LogbookViewProps {
  toastListener?: React.ReactNode
  isHydratingSubmissions?: boolean
  isLoading?: boolean
  isError?: boolean
  onRetry?: () => void | Promise<void>
  userId: string
  isOwnProfile: boolean
  logs: LogbookClimb[]
  progressLogs?: ProgressLogEntry[]
  lifetimeStats?: LogbookLifetimeStats
  profile?: LogbookProfile
  submissions: Submission[]
  submissionCounts?: OwnerSubmissionCounts
  savedClimbs: SavedClimb[]
  savedCrags: SavedCrag[]
  hasMoreLogs: boolean
  isLoadingMoreLogs: boolean
  deletingId: string | null
  deletingDraftId: string | null
  deletingSubmissionId: string | null
  publishingDraftId: string | null
  onDeleteLog: (logId: string) => void | Promise<void>
  onDeleteDraft: (draftId: string) => void | Promise<void>
  onPublishDraft: (draftId: string) => void | Promise<void>
  onDeleteSubmission: (canonicalImageId: string) => void | Promise<void>
  onLoadMoreLogs: () => void | Promise<void>
}

export default function LogbookView({
  toastListener,
  isHydratingSubmissions = false,
  isLoading = false,
  isError = false,
  onRetry,
  isOwnProfile,
  logs,
  progressLogs,
  lifetimeStats,
  profile,
  submissions,
  submissionCounts,
  savedClimbs,
  savedCrags,
  hasMoreLogs,
  isLoadingMoreLogs,
  deletingId,
  deletingDraftId,
  deletingSubmissionId,
  publishingDraftId,
  onDeleteLog,
  onDeleteDraft,
  onPublishDraft,
  onDeleteSubmission,
  onLoadMoreLogs,
}: LogbookViewProps) {
  const gradeSystem = useGradeSystem()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const isSubmissionsExpanded = searchParams.get('section') === 'submissions'

  useEffect(() => {
    if (!isSubmissionsExpanded || searchParams.get('section') !== 'submissions') return

    const element = document.getElementById('submissions')
    if (!element) return

    element.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [isSubmissionsExpanded, searchParams])

  const statsSource = progressLogs ?? logs
  const stats = useMemo(() => getLogbookStats(statsSource, lifetimeStats), [statsSource, lifetimeStats])
  const lowestGrade = getLogbookLowestGrade(stats)
  const recentLogs = useMemo(() => getRecentLogbookLogs(logs), [logs])
  const resolvedSubmissionCounts = useMemo(() => submissionCounts ?? getOwnerSubmissionCounts(submissions), [submissionCounts, submissions])
  const isEmpty = logs.length === 0
    && resolvedSubmissionCounts.all === 0
    && savedClimbs.length === 0
    && savedCrags.length === 0
  const climbUrlMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const log of logs) {
      if (log.canonical_url) {
        map.set(log.climb_id, log.canonical_url)
      }
    }
    return map
  }, [logs])

  if (isLoading) {
    return (
      <div className="min-h-screen bg-white dark:bg-gray-950">
        {toastListener}
        <LogbookSkeleton />
      </div>
    )
  }

  if (isError) {
    return (
      <div className="min-h-screen bg-white dark:bg-gray-950">
        {toastListener}
        <section role="alert" className="mx-auto max-w-xl p-6 text-center">
          <h1 className="text-xl font-bold">Logbook could not be loaded</h1>
          <p className="mt-2 text-sm text-muted-foreground">Your logbook data is still safe. Retry to load it again.</p>
          {onRetry ? <Button className="mt-4" onClick={() => void onRetry()}>Retry</Button> : null}
        </section>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white dark:bg-gray-950">
      {toastListener}

      {isOwnProfile && profile && (
        <Card className="m-0 border-x-0 border-t-0 rounded-none py-0 gap-0">
          <CardContent className="px-4 py-4">
            <h1 className="mb-3 text-2xl font-bold text-gray-900 dark:text-gray-100">
              {profile.first_name || profile.last_name
                ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim()
                : profile.display_name || profile.username}
            </h1>
            <div className="flex items-center gap-3">
              {profile.avatar_url ? (
                <Image
                  src={profile.avatar_url}
                  alt={profile.username}
                  width={40}
                  height={40}
                  sizes="40px"
                  unoptimized
                  className="h-10 w-10 rounded-full object-cover"
                />
              ) : (
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-200 dark:bg-gray-700">
                  <span className="text-sm font-medium text-gray-600 dark:text-gray-300">
                    {profile.username?.slice(0, 2).toUpperCase()}
                  </span>
                </div>
              )}
              <div className="leading-tight">
                <p className="text-sm text-gray-500 dark:text-gray-400">@{profile.username}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {!isOwnProfile && profile && (
        <Card className="m-0 border-x-0 border-t-0 rounded-none">
          <CardContent className="flex flex-col items-center gap-6 px-4 py-6 sm:flex-row sm:text-left">
            {profile.avatar_url ? (
              <Image
                src={profile.avatar_url}
                alt={profile.username}
                width={80}
                height={80}
                sizes="80px"
                unoptimized
                className="h-20 w-20 rounded-full object-cover"
              />
            ) : (
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gray-200 dark:bg-gray-700">
                <span className="text-2xl font-medium text-gray-600 dark:text-gray-300">
                  {profile.username?.slice(0, 2).toUpperCase()}
                </span>
              </div>
            )}
            <div className="text-center sm:text-left">
              <h1 className="mb-1 text-2xl font-bold text-gray-900 dark:text-gray-100">
                {profile.first_name || profile.last_name
                  ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim()
                  : profile.display_name || profile.username}
              </h1>
              <p className="text-gray-500 dark:text-gray-400">@{profile.username}</p>
              {profile.bio && <p className="mt-3 max-w-xl text-gray-600 dark:text-gray-300">{profile.bio}</p>}
              <div className="mt-4 flex flex-wrap gap-2">
                <span className="rounded-full bg-indigo-100 px-3 py-1 text-xs font-medium text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-200">
                  Contributor Score {profile.contributor_score_total || 0}
                </span>
                <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-800 dark:bg-gray-800 dark:text-gray-200">
                  {profile.accepted_contribution_count || 0} accepted
                </span>
                <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium capitalize text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200">
                  {(profile.contributor_tier || 'new_contributor').replace(/_/g, ' ')}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {isEmpty ? <EmptyLogbook onGoToMap={() => router.push('/')} /> : null}

          {stats ? (
        <LogbookStatsSection
          gradeSystem={gradeSystem}
          stats={stats}
          lowestGrade={lowestGrade}
          progressLogs={progressLogs ?? logs}
          recentLogs={recentLogs}
          isOwnProfile={isOwnProfile}
          deletingId={deletingId}
          onDeleteLog={onDeleteLog}
          climbUrlMap={climbUrlMap}
        />
      ) : null}

      {hasMoreLogs && (
        <div className="px-4 py-6 text-center">
          <button
            onClick={() => {
              void onLoadMoreLogs()
            }}
            disabled={isLoadingMoreLogs}
            className="px-6 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-full hover:bg-gray-200 disabled:opacity-50 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            {isLoadingMoreLogs ? 'Loading...' : 'Load more climbs'}
          </button>
        </div>
      )}

      {isOwnProfile ? <LogbookSavedSection savedClimbs={savedClimbs} savedCrags={savedCrags} /> : null}

      {isHydratingSubmissions && submissions.length === 0 ? <LogEntrySkeleton count={3} /> : null}

      {(isOwnProfile || submissions.length > 0) ? (
        <DeferredLogbookSubmissions
          expanded={isSubmissionsExpanded}
          isOwnProfile={isOwnProfile}
          submissions={submissions}
          ownerSubmissionCounts={resolvedSubmissionCounts}
          deletingDraftId={deletingDraftId}
          publishingDraftId={publishingDraftId}
          deletingSubmissionId={deletingSubmissionId}
          onExpand={() => {
            const params = new URLSearchParams(searchParams.toString())
            params.set('section', 'submissions')
            router.push(`${pathname}?${params.toString()}`, { scroll: false })
          }}
          onDeleteDraft={onDeleteDraft}
          onPublishDraft={onPublishDraft}
          onDeleteSubmission={onDeleteSubmission}
        />
      ) : null}
    </div>
  )
}
