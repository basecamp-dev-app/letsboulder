'use client'

import { useCallback, useState } from 'react'
import { deleteSubmissionDraftAction } from '@/features/submissions/actions/manage-submissions'
import type { Submission } from '@/types/submissions'

export function useDeleteDraft(refresh: () => Promise<void>, setSubmissions: React.Dispatch<React.SetStateAction<Submission[]>>) {
  const [deletingDraftId, setDeletingDraftId] = useState<string | null>(null)

  const deleteDraft = useCallback(async (draftId: string) => {
    setDeletingDraftId(draftId)
    try {
      const result = await deleteSubmissionDraftAction(draftId)
      if (result.status === 404) {
        await refresh()
        return true
      }

      if (!result.success) {
        throw new Error('Failed to delete draft')
      }

      setSubmissions((previous) => previous.filter((submission) => submission.id !== draftId))
      await refresh()
      return true
    } catch {
      return false
    } finally {
      setDeletingDraftId(null)
    }
  }, [refresh, setSubmissions])

  return {
    deletingDraftId,
    deleteDraft,
  }
}
