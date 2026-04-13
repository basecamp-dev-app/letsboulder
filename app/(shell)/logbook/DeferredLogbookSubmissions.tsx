'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { csrfFetch } from '@/hooks/useCsrf'
import { LogbookSubmissionsSection } from '@/features/logbook/components/LogbookSubmissionsSection'
import {
  getOwnerSubmissionCounts,
  getVisibleOwnerSubmissions,
  normalizeOwnerSubmissionsTab,
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
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [submissions, setSubmissions] = useState<Submission[]>(initialSubmissions || [])
  const [ownerSubmissionTab, setOwnerSubmissionTab] = useState<OwnerSubmissionsTab>(() => normalizeOwnerSubmissionsTab(searchParams.get('tab')))
  const [isLoading, setIsLoading] = useState(!initialSubmissions || initialSubmissions.length === 0)

  useEffect(() => {
    if (!isOwnProfile) return
    setOwnerSubmissionTab(normalizeOwnerSubmissionsTab(searchParams.get('tab')))
  }, [isOwnProfile, searchParams])

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

  const handleOwnerSubmissionTabChange = (tab: OwnerSubmissionsTab) => {
    setOwnerSubmissionTab(tab)

    if (!isOwnProfile) return

    const params = new URLSearchParams(searchParams.toString())
    params.set('section', 'submissions')
    if (tab === 'all') {
      params.delete('tab')
    } else {
      params.set('tab', tab)
    }

    const query = params.toString()
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })
  }

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
      onOwnerSubmissionTabChange={handleOwnerSubmissionTabChange}
      onDeleteDraft={onDeleteDraft}
      onPublishDraft={onPublishDraft}
      onDeleteSubmission={onDeleteSubmission}
    />
  )
}
