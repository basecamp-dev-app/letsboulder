'use client'

import { startTransition, useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { useGradeSystem } from '@/features/grades/hooks/useGradeSystem'
import { EmptyLogbook } from '@/features/logbook/components/LogbookStates'
import { LogbookStatsSection } from '@/features/logbook/components/LogbookStatsSection'
import { LogbookSubmissionsSection } from '@/features/logbook/components/LogbookSubmissionsSection'
import { ToastContainer, useToast } from '@/features/logbook/components/Toast'
import { ownLogbookQueryKey, type OwnLogbookData } from '@/features/logbook/lib/queries'
import {
  getLogbookLowestGrade,
  getLogbookStats,
  getOwnerSubmissionCounts,
  getRecentLogbookLogs,
  getVisibleOwnerSubmissions,
  replaceOwnLogbookLogs,
  replaceOwnLogbookSubmissions,
  type LogbookClimb,
  type LogbookProfile,
  type OwnerSubmissionsTab,
} from '@/features/logbook/lib/logbook-view'
import { createClient } from '@/lib/supabase'
import { csrfFetch } from '@/hooks/useCsrf'
import { fetchOwnSubmissions } from '@/features/submissions/lib/fetch-own-submissions'
import { deleteLogAction } from '@/features/logbook/actions/delete-log'
import {
  deletePublishedSubmissionAction,
  deleteSubmissionDraftAction,
  publishSubmissionDraftAction,
} from '@/features/submissions/actions/manage-submissions'
import type { Submission } from '@/types/submissions'

interface LogbookViewProps {
  userId: string
  isOwnProfile: boolean
  initialLogs?: LogbookClimb[]
  profile?: LogbookProfile
  initialSubmissions?: Submission[]
}

export default function LogbookView({ userId, isOwnProfile, initialLogs = [], profile, initialSubmissions = [] }: LogbookViewProps) {
  const gradeSystem = useGradeSystem()
  const router = useRouter()
  const queryClient = useQueryClient()
  const [logs, setLogs] = useState<LogbookClimb[]>(initialLogs)
  const [submissions, setSubmissions] = useState<Submission[]>(initialSubmissions)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deletingDraftId, setDeletingDraftId] = useState<string | null>(null)
  const [deletingSubmissionId, setDeletingSubmissionId] = useState<string | null>(null)
  const [publishingDraftId, setPublishingDraftId] = useState<string | null>(null)
  const [ownerSubmissionTab, setOwnerSubmissionTab] = useState<OwnerSubmissionsTab>('all')
  const [isMounted, setIsMounted] = useState(false)
  const { toasts, addToast, removeToast } = useToast()

  useEffect(() => {
    setIsMounted(true)
  }, [])

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

  const syncOwnLogbookCache = (updater: (current: OwnLogbookData) => OwnLogbookData) => {
    if (!isOwnProfile) return

    queryClient.setQueryData<OwnLogbookData>(ownLogbookQueryKey, (current) => {
      if (!current) return current
      return updater(current)
    })
  }

  const applyLogsUpdate = (nextLogs: LogbookClimb[]) => {
    setLogs(nextLogs)
    syncOwnLogbookCache((current) => replaceOwnLogbookLogs(current, nextLogs))
  }

  const applySubmissionsUpdate = (nextSubmissions: Submission[]) => {
    setSubmissions(nextSubmissions)
    syncOwnLogbookCache((current) => replaceOwnLogbookSubmissions(current, nextSubmissions))
  }

  const handleDeleteLog = async (logId: string) => {
    setDeletingId(logId)
    const previousLogs = logs
    const nextLogs = previousLogs.filter((log) => log.id !== logId)
    applyLogsUpdate(nextLogs)

    try {
      const result = await deleteLogAction(logId)
      if (!result.success) throw new Error(result.error)
      addToast('Climb removed from logbook', 'success')
    } catch {
      applyLogsUpdate(previousLogs)
      addToast('Failed to remove climb', 'error')
    } finally {
      setDeletingId(null)
    }
  }

  const handleDeleteDraft = async (draftId: string) => {
    setDeletingDraftId(draftId)
    const previousSubmissions = submissions
    const nextSubmissions = previousSubmissions.filter((submission) => submission.id !== draftId)
    applySubmissionsUpdate(nextSubmissions)

    try {
      const result = await deleteSubmissionDraftAction(draftId)
      if (result.status === 404) {
        addToast('Draft already removed', 'success')
        return
      }

      if (!result.success) throw new Error()
      addToast('Draft deleted', 'success')
    } catch {
      applySubmissionsUpdate(previousSubmissions)
      addToast('Failed to delete draft', 'error')
    } finally {
      setDeletingDraftId(null)
    }
  }

  const handleDeleteSubmission = async (canonicalImageId: string) => {
    setDeletingSubmissionId(canonicalImageId)
    const previousSubmissions = submissions
    const nextSubmissions = previousSubmissions.filter((submission) => {
      if (submission.id === canonicalImageId) return false
      if (submission.canonical_image_id === canonicalImageId) return false
      if (submission.image_ids?.includes(canonicalImageId)) return false
      return true
    })
    applySubmissionsUpdate(nextSubmissions)

    try {
      const result = await deletePublishedSubmissionAction(canonicalImageId)
      if (result.status === 404) {
        addToast('Submission already removed', 'success')
        return
      }

      if (!result.success) throw new Error()
      addToast('Submission deleted', 'success')
    } catch {
      applySubmissionsUpdate(previousSubmissions)
      addToast('Failed to delete submission', 'error')
    } finally {
      setDeletingSubmissionId(null)
    }
  }

  const handlePublishDraft = async (draftId: string) => {
    setPublishingDraftId(draftId)
    const previousSubmissions = submissions
    const now = new Date().toISOString()
    const optimisticSubmissions: Submission[] = previousSubmissions.map((submission) => (
      submission.id === draftId
        ? {
            ...submission,
            status: 'pending_review' as const,
            updated_at: now,
            is_optimistic: true,
          }
        : submission
    ))
    applySubmissionsUpdate(optimisticSubmissions)

    try {
      const result = await publishSubmissionDraftAction(draftId)
      const payload = (result.data || {}) as {
        published?: {
          imageId?: string
          imageIds?: string[]
          routeLineIds?: string[]
        }
      }
      if (!result.success) throw new Error()

      const supabase = createClient()
      const refreshed = await fetchOwnSubmissions(supabase, userId, csrfFetch, 24)
      applySubmissionsUpdate(refreshed)

      const imageId = payload.published?.imageId
      const imageCount = Array.isArray(payload.published?.imageIds)
        ? payload.published.imageIds.length
        : (imageId ? 1 : 0)
      const routeCount = Array.isArray(payload.published?.routeLineIds)
        ? payload.published.routeLineIds.length
        : 0
      addToast(`Success! Created ${routeCount} route${routeCount === 1 ? '' : 's'} across ${imageCount} face${imageCount === 1 ? '' : 's'}.`, 'success')
      if (imageId) {
        const query = new URLSearchParams({
          publishedFaces: String(imageCount),
          publishedRoutes: String(routeCount),
        })
        startTransition(() => {
          router.push(`/logbook/submissions/${imageId}/edit?${query.toString()}`)
        })
      }
    } catch {
      applySubmissionsUpdate(previousSubmissions)
      addToast('Failed to publish draft', 'error')
    } finally {
      setPublishingDraftId(null)
    }
  }

  const ownerSubmissionCounts = useMemo(() => getOwnerSubmissionCounts(submissions), [submissions])
  const ownerVisibleSubmissions = useMemo(
    () => getVisibleOwnerSubmissions(submissions, ownerSubmissionTab),
    [ownerSubmissionTab, submissions]
  )

  return (
    <div className="min-h-screen bg-white dark:bg-gray-950">
      {isMounted ? <ToastContainer toasts={toasts} onRemove={removeToast} /> : null}

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
          onDeleteLog={handleDeleteLog}
          climbUrlMap={climbUrlMap}
        />
      ) : null}

      {(isOwnProfile || submissions.length > 0) ? (
        <LogbookSubmissionsSection
          isOwnProfile={isOwnProfile}
          submissions={submissions}
          visibleSubmissions={ownerVisibleSubmissions}
          ownerSubmissionTab={ownerSubmissionTab}
          ownerSubmissionCounts={ownerSubmissionCounts}
          deletingDraftId={deletingDraftId}
          publishingDraftId={publishingDraftId}
          deletingSubmissionId={deletingSubmissionId}
          onOwnerSubmissionTabChange={(tab) => setOwnerSubmissionTab(tab)}
          onDeleteDraft={handleDeleteDraft}
          onPublishDraft={handlePublishDraft}
          onDeleteSubmission={handleDeleteSubmission}
        />
      ) : null}
    </div>
  )
}
