'use client'

import { startTransition, useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { User } from '@supabase/supabase-js'
import { useRouter, useSearchParams } from 'next/navigation'
import LogbookView from '@/features/logbook/components/LogbookView'
import { useToast } from '@/features/logbook/components/Toast'
import {
  fetchOwnLogbookSubmissions,
  fetchOwnLogbookSummary,
  ownLogbookSubmissionsQueryKey,
  ownLogbookSummaryQueryKey,
  type OwnLogbookData,
} from '@/features/logbook/lib/queries'
import { deleteLogAction } from '@/features/logbook/actions/delete-log'
import { createClient } from '@/lib/supabase'
import { csrfFetch } from '@/hooks/useCsrf'
import { fetchOwnSubmissions } from '@/features/submissions/lib/fetch-own-submissions'
import {
  deletePublishedSubmissionAction,
  deleteSubmissionDraftAction,
  publishSubmissionDraftAction,
} from '@/features/submissions/public'

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
  const [isSubmissionsExpanded, setIsSubmissionsExpanded] = useState(searchParams.get('section') === 'submissions')
  const hydratedInitialData = initialData
    ? {
        user,
        logs: initialData.logs,
        progressLogs: initialData.progressLogs,
        profile: initialData.profile,
        savedClimbs: initialData.savedClimbs,
        savedCrags: initialData.savedCrags,
        submissionCounts: initialData.submissionCounts,
      }
    : undefined

  const { data, isLoading } = useQuery({
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

  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deletingDraftId, setDeletingDraftId] = useState<string | null>(null)
  const [deletingSubmissionId, setDeletingSubmissionId] = useState<string | null>(null)
  const [publishingDraftId, setPublishingDraftId] = useState<string | null>(null)

  const logs = data?.logs ?? initialData?.logs ?? []
  const progressLogs = data?.progressLogs ?? initialData?.progressLogs ?? logs
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
    const previousLogs = logs
    updateOwnLogbookData((current) => ({
      ...current,
      logs: current.logs.filter((log) => log.id !== logId),
    }))

    try {
      const result = await deleteLogAction(logId)
      if (!result.success) throw new Error(result.error)
      addToast('Climb removed from logbook', 'success')
    } catch {
      updateOwnLogbookData((current) => ({ ...current, logs: previousLogs }))
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
        published?: {
          imageId?: string
          imageIds?: string[]
          routeLineIds?: string[]
        }
      }
      if (!result.success) throw new Error()

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
      addToast(`Success! Created ${routeCount} route${routeCount === 1 ? '' : 's'} across ${imageCount} face${imageCount === 1 ? '' : 's'}.`, 'success')
      if (imageId) {
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
      userId={user.id}
      isOwnProfile={true}
      logs={logs}
      progressLogs={progressLogs}
      profile={profile}
      submissions={submissions}
      submissionCounts={submissionCounts}
      initialSubmissionsExpanded={isSubmissionsExpanded}
      savedClimbs={savedClimbs}
      savedCrags={savedCrags}
      hasMoreLogs={false}
      isLoadingMoreLogs={false}
      deletingId={deletingId}
      deletingDraftId={deletingDraftId}
      deletingSubmissionId={deletingSubmissionId}
      publishingDraftId={publishingDraftId}
      onDeleteLog={handleDeleteLog}
      onDeleteDraft={handleDeleteDraft}
      onPublishDraft={handlePublishDraft}
      onDeleteSubmission={handleDeleteSubmission}
      onExpandSubmissions={() => setIsSubmissionsExpanded(true)}
      onLoadMoreLogs={() => {}}
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
