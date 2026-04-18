'use client'

import { useEffect, useMemo } from 'react'
import dynamic from 'next/dynamic'
import Image from 'next/image'
import { useRouter, useSearchParams } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { useGradeSystem } from '@/lib/grades/preferences'
import { EmptyLogbook, LogEntrySkeleton } from '@/features/logbook/components/LogbookStates'
import { LogbookStatsSection } from '@/features/logbook/components/LogbookStatsSection'
import {
  getLogbookLowestGrade,
  getLogbookStats,
  getRecentLogbookLogs,
  type LogbookClimb,
  type LogbookProfile,
} from '@/features/logbook/lib/logbook-view'
import type { Submission } from '@/types/submissions'

const DeferredLogbookSubmissions = dynamic(() => import('@/app/(shell)/logbook/DeferredLogbookSubmissions'), {
  ssr: false,
})

interface LogbookViewProps {
  toastListener?: React.ReactNode
  isHydratingSubmissions?: boolean
  userId: string
  isOwnProfile: boolean
  logs: LogbookClimb[]
  profile?: LogbookProfile
  submissions: Submission[]
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
  isOwnProfile,
  logs,
  profile,
  submissions,
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
  const searchParams = useSearchParams()

  useEffect(() => {
    if (searchParams.get('section') !== 'submissions') return

    const element = document.getElementById('submissions')
    if (!element) return

    element.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [searchParams])

  const stats = useMemo(() => getLogbookStats(logs), [logs])
  const lowestGrade = getLogbookLowestGrade(stats)
  const recentLogs = useMemo(() => getRecentLogbookLogs(logs), [logs])
  const climbUrlMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const log of logs) {
      if (log.canonical_url) {
        map.set(log.climb_id, log.canonical_url)
      }
    }
    return map
  }, [logs])

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
            </div>
          </CardContent>
        </Card>
      )}

      {logs.length === 0 && submissions.length === 0 ? <EmptyLogbook onGoToMap={() => router.push('/')} /> : null}

          {stats ? (
        <LogbookStatsSection
          gradeSystem={gradeSystem}
          stats={stats}
          lowestGrade={lowestGrade}
          recentLogs={recentLogs}
          isOwnProfile={isOwnProfile}
          deletingId={deletingId}
          onDeleteLog={onDeleteLog}
          climbUrlMap={climbUrlMap}
        />
      ) : null}

      {!isOwnProfile && hasMoreLogs && (
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

      {isHydratingSubmissions && submissions.length === 0 ? <LogEntrySkeleton count={3} /> : null}

      {(isOwnProfile || submissions.length > 0) ? (
        <DeferredLogbookSubmissions
          isOwnProfile={isOwnProfile}
          submissions={submissions}
          deletingDraftId={deletingDraftId}
          publishingDraftId={publishingDraftId}
          deletingSubmissionId={deletingSubmissionId}
          onDeleteDraft={onDeleteDraft}
          onPublishDraft={onPublishDraft}
          onDeleteSubmission={onDeleteSubmission}
        />
      ) : null}
    </div>
  )
}
