'use client'

import { useDeleteDraft } from '@/features/submissions/hooks/use-delete-draft'
import { useDeleteSubmission } from '@/features/submissions/hooks/use-delete-submission'
import { usePublishDraft } from '@/features/submissions/hooks/use-publish-draft'
import { useSubmissionsQuery } from '@/features/submissions/hooks/use-submissions-query'

export function useSubmissions() {
  const { submissions, setSubmissions, loading, error, refresh } = useSubmissionsQuery()
  const { deletingDraftId, deleteDraft } = useDeleteDraft(refresh, setSubmissions)
  const { deletingSubmissionId, deleteSubmission } = useDeleteSubmission(refresh, setSubmissions)
  const { publishingDraftId, publishDraft } = usePublishDraft(refresh)

  return {
    submissions,
    loading,
    error,
    deletingDraftId,
    deletingSubmissionId,
    publishingDraftId,
    refresh,
    deleteDraft,
    deleteSubmission,
    publishDraft,
  }
}
