'use client'

import { useCallback, useState } from 'react'
import { deletePublishedSubmissionAction } from '@/features/submissions/actions/manage-submissions'
import type { Submission } from '@/types/submissions'

export function useDeleteSubmission(refresh: () => Promise<void>, setSubmissions: React.Dispatch<React.SetStateAction<Submission[]>>) {
  const [deletingSubmissionId, setDeletingSubmissionId] = useState<string | null>(null)

  const deleteSubmission = useCallback(async (canonicalImageId: string) => {
    setDeletingSubmissionId(canonicalImageId)
    try {
      const result = await deletePublishedSubmissionAction(canonicalImageId)
      if (result.status === 404) {
        await refresh()
        return true
      }

      if (!result.success) {
        throw new Error('Failed to delete submission')
      }

      setSubmissions((previous) => previous.filter((submission) => {
        if (submission.id === canonicalImageId) return false
        if (submission.canonical_image_id === canonicalImageId) return false
        if (submission.image_ids?.includes(canonicalImageId)) return false
        return true
      }))
      await refresh()
      return true
    } catch {
      return false
    } finally {
      setDeletingSubmissionId(null)
    }
  }, [refresh, setSubmissions])

  return {
    deletingSubmissionId,
    deleteSubmission,
  }
}
