'use client'

import { startTransition, useEffect, useMemo, useState } from 'react'
import { useInfiniteQuery, useQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query'
import type { User } from '@supabase/supabase-js'
import { useRouter, useSearchParams } from 'next/navigation'
import LogbookView from '@/features/logbook/components/LogbookView'
import { useToast } from '@/features/logbook/components/Toast'
import {
  fetchOwnLogbookSubmissions,
  fetchOwnLogbookSummary,
  ownLogbookLogsQueryKey,
  ownLogbookSubmissionsQueryKey,
  ownLogbookSummaryQueryKey,
  type OwnLogbookData,
} from '@/features/logbook/lib/queries'
import type { LogbookPage } from '@/features/logbook/lib/logbook-contract'
import { deleteLogAction } from '@/features/logbook/actions/delete-log'
import { loadMoreLogbookAction } from '@/features/logbook/actions/load-more-logbook'
import { createClient } from '@/lib/supabase'
import { csrfFetch } from '@/hooks/useCsrf'
import { invalidateCragQueries } from '@/features/crags/lib/invalidate-crag-queries'
import { fetchOwnSubmissions } from '@/features/submissions/lib/fetch-own-submissions'
import {
  deletePublishedSubmissionAction,
  deleteSubmissionDraftAction,
  publishSubmissionDraftAction,
} from '@/features/submissions/public-actions'

interface LogbookClientProps {
  user: User
  initialData?: OwnLogbookData
}

export default function LogbookClient({ user, initialData }: LogbookClientProps) {
  return <LogbookContent user={user} initialData={initialData} />
}

function LogbookContent({ user, initialData }: { user: User; initialData?: OwnLogbookData }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const queryClient = useQueryClient()
  const { addToast } = useToast()
  const isSubmissionsExpanded = searchParams.get('section') === 'submissions'
  const hydratedInitialData = initialData
    ? {
         user,
         userId: user.id,
         isOwnProfile: true as const,
         isPublic: true,
         logs: initialData.logs,
         nextCursor: initialData.nextCursor,
        progressLogs: initialData.progressLogs,
        lifetimeStats: initialData.lifetimeStats,
        profile: initialData.profile,
        savedClimbs: initialData.savedClimbs,
        savedCrags: initialData.savedCrags,
         submissionCounts: initialData.submissionCounts,
         submissions: [],
      }
    : undefined

  const { data, isLoading, isError, refetch } = useQuery<OwnLogbookData, Error, OwnLogbookData>({
    queryKey: ownLogbookSummaryQueryKey,
    queryFn: () => fetchOwnLogbookSummary(user),
    initialData: hydratedInitialData,
    gcTime: 30 * 60 * 1000,
  })

  const { data: submissions = [] } = useQuery({
    queryKey: ownLogbookSubmissionsQueryKey,
    queryFn: () => fetchOwnLogbookSubmissions(user),
    initialData: isSubmissionsExpanded ? initialData?.submissionCounts.all !== 0 ? undefined : [] : undefined,
    enabled: isSubmissionsExpanded,
    gcTime: 30 * 60 * 1000,
  })

  const logsQuery = useInfiniteQuery({
    queryKey: ownLogbookLogsQueryKey(user.id),
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      const result = await loadMoreLogbookAction(user.id, pageParam, 'owner')
      if (!result.success) throw new Error(result.error)
      return {
        logs: result.logs,
        progressLogs: result.progressLogs,
        nextCursor: result.nextCursor,
      }
    },
    initialData: initialData
      ? { pages: [{ logs: initialData.logs, progressLogs: initialData.progressLogs, nextCursor: initialData.nextCursor }], pageParams: [null] }
      : undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    gcTime: 30 * 60 * 1000,
  })

  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deletingDraftId, setDeletingDraftId] = useState<string | null>(null)
  const [deletingSubmissionId, setDeletingSubmissionId] = useState<string | null>(null)
  const [publishingDraftId, setPublishingDraftId] = useState<string | null>(null)

  const logs = logsQuery.data?.pages.flatMap((page) => page.logs) ?? data?.logs ?? initialData?.logs ?? []
  const progressLogs = logsQuery.data?.pages.flatMap((page) => page.progressLogs) ?? data?.progressLogs ?? initialData?.progressLogs ?? logs
  const lifetimeStats = data?.lifetimeStats ?? initialData?.lifetimeStats
  const profile = data?.profile ?? initialData?.profile ?? undefined
  const savedClimbs = useMemo(() => data?.savedClimbs ?? initialData?.savedClimbs ?? [], [data?.savedClimbs, initialData?.savedClimbs])
  const savedCrags = useMemo(() => data?.savedCrags ?? initialData?.savedCrags ?? [], [data?.savedCrags, initialData?.savedCrags])
  const submissionCounts = data?.submissionCounts ?? initialData?.submissionCounts ?? {
    all: submissions.length,
    drafts: submissions.filter((submission) => submission.status === 'draft').length,
    'pending-review': submissions.filter((submission) => submission.status === 'pending_review').length,
    published: submissions.filter((submission) => submission.status === 'published').length,
  }

  const updateOwnLogbookData = (updater: (current: OwnLogbookData) => OwnLogbookData) => {
    queryClient.setQueryData<OwnLogbookData>(ownLogbookSummaryQueryKey, (current) => {
      if (!current) return current
      return updater(current)
    })
  }

  const updateOwnSubmissions = (updater: (current: typeof submissions) => typeof submissions) => {
    queryClient.setQueryData<typeof submissions>(ownLogbookSubmissionsQueryKey, (current) => updater(current ?? []))
  }

  const handleDeleteLog = async (logId: string) => {
    setDeletingId(logId)
    const previousSummary = queryClient.getQueryData<OwnLogbookData>(ownLogbookSummaryQueryKey)
    const previousLogPages = queryClient.getQueryData<InfiniteData<LogbookPage, string | null>>(ownLogbookLogsQueryKey(user.id))
    const deletedLog = logs.find((log) => log.id === logId)

    queryClient.setQueryData<InfiniteData<LogbookPage, string | null>>(ownLogbookLogsQueryKey(user.id), (current) => current
      ? { ...current, pages: current.pages.map((page) => ({ ...page, logs: page.logs.filter((log) => log.id !== logId) })) }
      : current)
    updateOwnLogbookData((current) => ({
      ...current,
      logs: current.logs.filter((log) => log.id !== logId),
      progressLogs: current.progressLogs.filter((log) => log.id !== logId),
      lifetimeStats: deletedLog
        ? {
            ...current.lifetimeStats,
            totalClimbs: Math.max(0, current.lifetimeStats.totalClimbs - 1),
            totalFlashes: Math.max(0, current.lifetimeStats.totalFlashes - (deletedLog.style === 'flash' ? 1 : 0)),
            totalTops: Math.max(0, current.lifetimeStats.totalTops - (deletedLog.style === 'top' ? 1 : 0)),
            totalTries: Math.max(0, current.lifetimeStats.totalTries - (deletedLog.style === 'try' ? 1 : 0)),
          }
        : current.lifetimeStats,
    }))

    try {
      const result = await deleteLogAction(logId)
      if (!result.success) throw new Error(result.error)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ownLogbookSummaryQueryKey }),
        queryClient.invalidateQueries({ queryKey: ownLogbookLogsQueryKey(user.id) }),
      ])
      addToast('Climb removed from logbook', 'success')
    } catch {
      queryClient.setQueryData(ownLogbookSummaryQueryKey, previousSummary)
      queryClient.setQueryData(ownLogbookLogsQueryKey(user.id), previousLogPages)
      addToast('Failed to remove climb', 'error')
    } finally {
      setDeletingId(null)
    }
  }

  const handleDeleteDraft = async (draftId: string) => {
    setDeletingDraftId(draftId)
    const previousSubmissions = submissions
    updateOwnSubmissions((current) => current.filter((submission) => submission.id !== draftId))
    updateOwnLogbookData((current) => ({ ...current, submissionCounts: {
      ...current.submissionCounts,
      all: Math.max(0, current.submissionCounts.all - 1),
      drafts: Math.max(0, current.submissionCounts.drafts - 1),
    } }))

    try {
      const result = await deleteSubmissionDraftAction(draftId)
      if (result.status === 404) {
        addToast('Draft already removed', 'success')
        return
      }

      if (!result.success) throw new Error()
      addToast('Draft deleted', 'success')
    } catch {
      queryClient.setQueryData(ownLogbookSubmissionsQueryKey, previousSubmissions)
      updateOwnLogbookData((current) => ({ ...current, submissionCounts: {
        all: previousSubmissions.length,
        drafts: previousSubmissions.filter((submission) => submission.status === 'draft').length,
        'pending-review': previousSubmissions.filter((submission) => submission.status === 'pending_review').length,
        published: previousSubmissions.filter((submission) => submission.status === 'published').length,
      } }))
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
    updateOwnSubmissions(() => nextSubmissions)
    updateOwnLogbookData((current) => ({ ...current, submissionCounts: {
      all: nextSubmissions.length,
      drafts: nextSubmissions.filter((submission) => submission.status === 'draft').length,
      'pending-review': nextSubmissions.filter((submission) => submission.status === 'pending_review').length,
      published: nextSubmissions.filter((submission) => submission.status === 'published').length,
    } }))

    try {
      const result = await deletePublishedSubmissionAction(canonicalImageId)
      if (result.status === 404) {
        addToast('Submission already removed', 'success')
        return
      }

      if (!result.success) throw new Error()
      if (result.data?.cragId) await invalidateCragQueries(queryClient, result.data.cragId)
      addToast('Submission deleted', 'success')
    } catch {
      queryClient.setQueryData(ownLogbookSubmissionsQueryKey, previousSubmissions)
      updateOwnLogbookData((current) => ({ ...current, submissionCounts: {
        all: previousSubmissions.length,
        drafts: previousSubmissions.filter((submission) => submission.status === 'draft').length,
        'pending-review': previousSubmissions.filter((submission) => submission.status === 'pending_review').length,
        published: previousSubmissions.filter((submission) => submission.status === 'published').length,
      } }))
      addToast('Failed to delete submission', 'error')
    } finally {
      setDeletingSubmissionId(null)
    }
  }

  const handlePublishDraft = async (draftId: string) => {
    setPublishingDraftId(draftId)
    const previousSubmissions = submissions
    const now = new Date().toISOString()
    const optimisticSubmissions = previousSubmissions.map((submission) => (
        submission.id === draftId
          ? {
              ...submission,
              status: 'pending_review' as const,
              updated_at: now,
              is_optimistic: true,
            }
          : submission
      ))
    updateOwnSubmissions(() => optimisticSubmissions)
    updateOwnLogbookData((current) => ({ ...current, submissionCounts: {
      all: optimisticSubmissions.length,
      drafts: optimisticSubmissions.filter((submission) => submission.status === 'draft').length,
      'pending-review': optimisticSubmissions.filter((submission) => submission.status === 'pending_review').length,
      published: optimisticSubmissions.filter((submission) => submission.status === 'published').length,
    } }))

    try {
      const result = await publishSubmissionDraftAction(draftId)
      const payload = (result.data || {}) as {
        publication?: {
          state?: 'public' | 'pending_crag_review'
        }
        published?: {
          imageId?: string
          imageIds?: string[]
          routeLineIds?: string[]
        }
        cragId?: string | null
      }
      if (!result.success) throw new Error()
      if (payload.cragId) await invalidateCragQueries(queryClient, payload.cragId)

      const supabase = createClient()
      const refreshed = await fetchOwnSubmissions(supabase, user.id, csrfFetch, 24)
      queryClient.setQueryData(ownLogbookSubmissionsQueryKey, refreshed)
      updateOwnLogbookData((current) => ({ ...current, submissionCounts: {
        all: refreshed.length,
        drafts: refreshed.filter((submission) => submission.status === 'draft').length,
        'pending-review': refreshed.filter((submission) => submission.status === 'pending_review').length,
        published: refreshed.filter((submission) => submission.status === 'published').length,
      } }))

      const imageId = payload.published?.imageId
      const imageCount = Array.isArray(payload.published?.imageIds)
        ? payload.published.imageIds.length
        : (imageId ? 1 : 0)
      const routeCount = Array.isArray(payload.published?.routeLineIds)
        ? payload.published.routeLineIds.length
        : 0
      const isPendingCragReview = payload.publication?.state === 'pending_crag_review'
      addToast(
        isPendingCragReview
          ? 'Submitted for review. Routes and images will appear after the crag is published.'
          : `Success! Created ${routeCount} route${routeCount === 1 ? '' : 's'} across ${imageCount} face${imageCount === 1 ? '' : 's'}.`,
        'success'
      )
      if (imageId && !isPendingCragReview) {
        startTransition(() => {
          router.push(`/submit?draft=${draftId}&publishedFaces=${imageCount}&publishedRoutes=${routeCount}`)
        })
      }
    } catch {
      queryClient.setQueryData(ownLogbookSubmissionsQueryKey, previousSubmissions)
      updateOwnLogbookData((current) => ({ ...current, submissionCounts: {
        all: previousSubmissions.length,
        drafts: previousSubmissions.filter((submission) => submission.status === 'draft').length,
        'pending-review': previousSubmissions.filter((submission) => submission.status === 'pending_review').length,
        published: previousSubmissions.filter((submission) => submission.status === 'published').length,
      } }))
      addToast('Failed to publish draft', 'error')
    } finally {
      setPublishingDraftId(null)
    }
  }

  return (
    <LogbookView
      toastListener={<LogbookPaymentToastListener onToast={addToast} />}
      isHydratingSubmissions={isLoading && !!initialData}
      isLoading={isLoading && !data}
      isError={isError && !data}
      onRetry={() => void refetch()}
      userId={user.id}
      isOwnProfile={true}
      logs={logs}
      progressLogs={progressLogs}
      lifetimeStats={lifetimeStats}
      profile={profile}
      submissions={submissions}
      submissionCounts={submissionCounts}
      savedClimbs={savedClimbs}
      savedCrags={savedCrags}
      hasMoreLogs={Boolean(logsQuery.hasNextPage)}
      isLoadingMoreLogs={logsQuery.isFetchingNextPage}
      deletingId={deletingId}
      deletingDraftId={deletingDraftId}
      deletingSubmissionId={deletingSubmissionId}
      publishingDraftId={publishingDraftId}
      onDeleteLog={handleDeleteLog}
      onDeleteDraft={handleDeleteDraft}
      onPublishDraft={handlePublishDraft}
      onDeleteSubmission={handleDeleteSubmission}
      onLoadMoreLogs={() => void logsQuery.fetchNextPage()}
    />
  )
}

function LogbookPaymentToastListener({
  onToast,
}: {
  onToast: (message: string, type?: 'success' | 'error' | 'info') => void
}) {
  const searchParams = useSearchParams()

  useEffect(() => {
    if (searchParams.get('success')) {
      onToast('Payment successful! You are now a Pro member.', 'success')
    }
    if (searchParams.get('canceled')) {
      onToast('Payment canceled. No worries, try again when ready!', 'info')
    }
  }, [searchParams, onToast])

  return null
}
