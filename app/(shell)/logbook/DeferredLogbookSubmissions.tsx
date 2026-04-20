'use client'

import { useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { LogbookSubmissionsSection } from '@/features/logbook/components/LogbookSubmissionsSection'
import {
  getOwnerSubmissionCounts,
  getVisibleOwnerSubmissions,
  normalizeOwnerSubmissionsTab,
  type OwnerSubmissionsTab,
} from '@/features/logbook/lib/logbook-view'
import type { Submission } from '@/types/submissions'

interface DeferredLogbookSubmissionsProps {
  expanded: boolean
  isOwnProfile: boolean
  submissions: Submission[]
  ownerSubmissionCounts: ReturnType<typeof getOwnerSubmissionCounts>
  deletingDraftId: string | null
  publishingDraftId: string | null
  deletingSubmissionId: string | null
  onExpand: () => void
  onDeleteDraft: (draftId: string) => void
  onPublishDraft: (draftId: string) => void
  onDeleteSubmission: (canonicalImageId: string) => void
}

export default function DeferredLogbookSubmissions({
  expanded,
  isOwnProfile,
  submissions,
  ownerSubmissionCounts,
  deletingDraftId,
  publishingDraftId,
  deletingSubmissionId,
  onExpand,
  onDeleteDraft,
  onPublishDraft,
  onDeleteSubmission,
}: DeferredLogbookSubmissionsProps) {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [ownerSubmissionTab, setOwnerSubmissionTab] = useState<OwnerSubmissionsTab>(() => normalizeOwnerSubmissionsTab(searchParams.get('tab')))
  const activeOwnerSubmissionTab = isOwnProfile
    ? normalizeOwnerSubmissionsTab(searchParams.get('tab'))
    : ownerSubmissionTab

  const visibleSubmissions = expanded ? getVisibleOwnerSubmissions(submissions, activeOwnerSubmissionTab) : []

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
      expanded={expanded}
      submissions={submissions}
      visibleSubmissions={visibleSubmissions}
      isLoading={false}
      ownerSubmissionTab={activeOwnerSubmissionTab}
      ownerSubmissionCounts={ownerSubmissionCounts}
      deletingDraftId={deletingDraftId}
      publishingDraftId={publishingDraftId}
      deletingSubmissionId={deletingSubmissionId}
      onExpand={onExpand}
      onOwnerSubmissionTabChange={handleOwnerSubmissionTabChange}
      onDeleteDraft={onDeleteDraft}
      onPublishDraft={onPublishDraft}
      onDeleteSubmission={onDeleteSubmission}
    />
  )
}
