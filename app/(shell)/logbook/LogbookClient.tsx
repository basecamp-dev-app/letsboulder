'use client'

import { startTransition, useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { User } from '@supabase/supabase-js'
import { useRouter, useSearchParams } from 'next/navigation'
import LogbookView from '@/features/logbook/components/LogbookView'
import { useToast } from '@/features/logbook/components/Toast'
import { fetchOwnLogbookData, ownLogbookQueryKey, type OwnLogbookData } from '@/features/logbook/lib/queries'
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
  const queryClient = useQueryClient()
  const { addToast } = useToast()
  const hydratedInitialData = initialData
    ? {
        user,
        logs: initialData.logs,
        profile: initialData.profile,
        submissions: initialData.submissions,
        savedClimbs: initialData.savedClimbs,
        savedCrags: initialData.savedCrags,
      }
    : undefined

  const { data, isLoading } = useQuery({
    queryKey: ownLogbookQueryKey,
    queryFn: () => fetchOwnLogbookData(user),
    initialData: hydratedInitialData,
    gcTime: 30 * 60 * 1000,
  })

  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deletingDraftId, setDeletingDraftId] = useState<string | null>(null)
  const [deletingSubmissionId, setDeletingSubmissionId] = useState<string | null>(null)
  const [publishingDraftId, setPublishingDraftId] = useState<string | null>(null)

  const logs = data?.logs ?? initialData?.logs ?? []
  const profile = data?.profile ?? initialData?.profile ?? undefined
  const submissions = data?.submissions ?? initialData?.submissions ?? []
  const savedClimbs = data?.savedClimbs ?? initialData?.savedClimbs ?? []
  const savedCrags = data?.savedCrags ?? initialData?.savedCrags ?? []

  const updateOwnLogbookData = (updater: (current: OwnLogbookData) => OwnLogbookData) => {
    queryClient.setQueryData<OwnLogbookData>(ownLogbookQueryKey, (current) => {
      if (!current) return current
      return updater(current)
    })
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
    updateOwnLogbookData((current) => ({
      ...current,
      submissions: current.submissions.filter((submission) => submission.id !== draftId),
    }))

    try {
      const result = await deleteSubmissionDraftAction(draftId)
      if (result.status === 404) {
        addToast('Draft already removed', 'success')
        return
      }

      if (!result.success) throw new Error()
      addToast('Draft deleted', 'success')
    } catch {
      updateOwnLogbookData((current) => ({ ...current, submissions: previousSubmissions }))
      addToast('Failed to delete draft', 'error')
    } finally {
      setDeletingDraftId(null)
    }
  }

  const handleDeleteSubmission = async (canonicalImageId: string) => {
    setDeletingSubmissionId(canonicalImageId)
    const previousSubmissions = submissions
    updateOwnLogbookData((current) => ({
      ...current,
      submissions: current.submissions.filter((submission) => {
        if (submission.id === canonicalImageId) return false
        if (submission.canonical_image_id === canonicalImageId) return false
        if (submission.image_ids?.includes(canonicalImageId)) return false
        return true
      }),
    }))

    try {
      const result = await deletePublishedSubmissionAction(canonicalImageId)
      if (result.status === 404) {
        addToast('Submission already removed', 'success')
        return
      }

      if (!result.success) throw new Error()
      addToast('Submission deleted', 'success')
    } catch {
      updateOwnLogbookData((current) => ({ ...current, submissions: previousSubmissions }))
      addToast('Failed to delete submission', 'error')
    } finally {
      setDeletingSubmissionId(null)
    }
  }

  const handlePublishDraft = async (draftId: string) => {
    setPublishingDraftId(draftId)
    const previousSubmissions = submissions
    const now = new Date().toISOString()
    updateOwnLogbookData((current) => ({
      ...current,
      submissions: current.submissions.map((submission) => (
        submission.id === draftId
          ? {
              ...submission,
              status: 'pending_review' as const,
              updated_at: now,
              is_optimistic: true,
            }
          : submission
      )),
    }))

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
      updateOwnLogbookData((current) => ({ ...current, submissions: refreshed }))

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
      updateOwnLogbookData((current) => ({ ...current, submissions: previousSubmissions }))
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
      profile={profile}
      submissions={submissions}
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
