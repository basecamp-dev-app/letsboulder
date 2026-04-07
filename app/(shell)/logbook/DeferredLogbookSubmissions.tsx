'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { csrfFetch } from '@/hooks/useCsrf'
import { LogbookSubmissionsSection } from '@/features/logbook/components/LogbookSubmissionsSection'
import {
  getOwnerSubmissionCounts,
  getVisibleOwnerSubmissions,
  type OwnerSubmissionsTab,
} from '@/features/logbook/lib/logbook-view'
import { fetchOwnSubmissions } from '@/features/submissions/lib/fetch-own-submissions'
import type { Submission } from '@/types/submissions'

interface DeferredLogbookSubmissionsProps {
  userId: string
  isOwnProfile: boolean
  initialSubmissions?: Submission[]
  deletingDraftId: string | null
  publishingDraftId: string | null
  deletingSubmissionId: string | null
  onDeleteDraft: (draftId: string) => void
  onPublishDraft: (draftId: string) => void
  onDeleteSubmission: (canonicalImageId: string) => void
}

export default function DeferredLogbookSubmissions({
  userId,
  isOwnProfile,
  initialSubmissions,
  deletingDraftId,
  publishingDraftId,
  deletingSubmissionId,
  onDeleteDraft,
  onPublishDraft,
  onDeleteSubmission,
}: DeferredLogbookSubmissionsProps) {
  const [submissions, setSubmissions] = useState<Submission[]>(initialSubmissions || [])
  const [ownerSubmissionTab, setOwnerSubmissionTab] = useState<OwnerSubmissionsTab>('all')
  const [isLoading, setIsLoading] = useState(!initialSubmissions || initialSubmissions.length === 0)

  useEffect(() => {
    if (initialSubmissions && initialSubmissions.length > 0) {
      setSubmissions(initialSubmissions)
      setIsLoading(false)
      return
    }

    let cancelled = false

    const loadSubmissions = async () => {
      try {
        const supabase = createClient()
        const nextSubmissions = await fetchOwnSubmissions(supabase, userId, csrfFetch, 24)
        if (!cancelled) {
          setSubmissions(nextSubmissions)
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    const timer = window.setTimeout(() => {
      void loadSubmissions()
    }, 0)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [initialSubmissions, userId])

  const ownerSubmissionCounts = getOwnerSubmissionCounts(submissions)
  const visibleSubmissions = getVisibleOwnerSubmissions(submissions, ownerSubmissionTab)

  return (
    <LogbookSubmissionsSection
      isOwnProfile={isOwnProfile}
      submissions={submissions}
      visibleSubmissions={visibleSubmissions}
      isLoading={isLoading}
      ownerSubmissionTab={ownerSubmissionTab}
      ownerSubmissionCounts={ownerSubmissionCounts}
      deletingDraftId={deletingDraftId}
      publishingDraftId={publishingDraftId}
      deletingSubmissionId={deletingSubmissionId}
      onOwnerSubmissionTabChange={setOwnerSubmissionTab}
      onDeleteDraft={onDeleteDraft}
      onPublishDraft={onPublishDraft}
      onDeleteSubmission={onDeleteSubmission}
    />
  )
}
